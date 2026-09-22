import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import { beforeAll, describe, it } from "vitest";
import {
  createSessionToken,
  hashPassword,
  readSessionToken,
  roleHas,
  validatePasswordStrength,
  verifyPassword,
} from "@/server/auth";

/**
 * Credential and session handling.
 *
 * This is the one part of the admin panel where a subtle bug is a breach rather
 * than a broken screen, so the properties worth pinning down are: a password is
 * never recoverable from what is stored, a token cannot be edited without
 * invalidating it, and an expired token is refused.
 */

beforeAll(() => {
  const path = ".test-store/auth.json";
  process.env.PRESTINE_STORE_PATH = path;

  // Fresh store per run, so admin-account assertions cannot be satisfied (or
  // broken) by accounts a previous run created. See repositories.test.ts.
  rmSync(path, { force: true });
});

const PASSWORD = "Prestine-Test-1234";

describe("password hashing", () => {
  it("never stores the password itself", async () => {
    const { hash, salt } = await hashPassword(PASSWORD);
    assert.ok(!hash.includes(PASSWORD));
    assert.ok(!salt.includes(PASSWORD));
    assert.match(hash, /^[0-9a-f]+$/);
    assert.match(salt, /^[0-9a-f]+$/);
  });

  it("salts each hash, so identical passwords do not collide", async () => {
    const a = await hashPassword(PASSWORD);
    const b = await hashPassword(PASSWORD);
    assert.notEqual(a.salt, b.salt);
    assert.notEqual(a.hash, b.hash);
  });

  it("verifies the right password and rejects the wrong one", async () => {
    const { hash, salt } = await hashPassword(PASSWORD);
    assert.equal(await verifyPassword(PASSWORD, hash, salt), true);
    assert.equal(await verifyPassword("Prestine-Test-1235", hash, salt), false);
    assert.equal(await verifyPassword("", hash, salt), false);
  });

  it("rejects a hash verified against the wrong salt", async () => {
    const a = await hashPassword(PASSWORD);
    const b = await hashPassword(PASSWORD);
    assert.equal(await verifyPassword(PASSWORD, a.hash, b.salt), false);
  });

  it("does not throw on malformed stored values", async () => {
    assert.equal(await verifyPassword(PASSWORD, "not-hex", "also-not-hex"), false);
    assert.equal(await verifyPassword(PASSWORD, "", ""), false);
  });
});

describe("password policy", () => {
  it("accepts a password that meets every rule", () => {
    assert.equal(validatePasswordStrength(PASSWORD), null);
  });

  it("names the specific rule that failed", () => {
    assert.match(validatePasswordStrength("Short1A") ?? "", /12 characters/);
    assert.match(validatePasswordStrength("ALLUPPERCASE123") ?? "", /lowercase/);
    assert.match(validatePasswordStrength("alllowercase123") ?? "", /uppercase/);
    assert.match(validatePasswordStrength("NoDigitsInHere") ?? "", /number/);
  });
});

describe("session tokens", () => {
  const payload = {
    userId: "adm-1",
    email: "owner@prestine.test",
    role: "owner" as const,
    expiresAt: Math.floor(Date.now() / 1000) + 3600,
  };

  it("round-trips a valid session", () => {
    const decoded = readSessionToken(createSessionToken(payload));
    assert.deepEqual(decoded, payload);
  });

  it("refuses a token with a tampered body", () => {
    const token = createSessionToken(payload);
    const [body, signature] = token.split(".");

    // Re-encode the payload with an escalated role, keeping the original signature.
    const forged = Buffer.from(
      JSON.stringify({ ...payload, role: "owner", userId: "adm-999" }),
    )
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    assert.notEqual(forged, body);
    assert.equal(readSessionToken(`${forged}.${signature}`), null);
  });

  it("refuses a token with a tampered signature", () => {
    const [body] = createSessionToken(payload).split(".");
    assert.equal(readSessionToken(`${body}.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA`), null);
    assert.equal(readSessionToken(`${body}.`), null);
    assert.equal(readSessionToken(body), null);
  });

  it("refuses an expired token even though the signature is valid", () => {
    const expired = createSessionToken({
      ...payload,
      expiresAt: Math.floor(Date.now() / 1000) - 1,
    });
    assert.equal(readSessionToken(expired), null);
  });

  it("refuses nothing at all", () => {
    assert.equal(readSessionToken(undefined), null);
    assert.equal(readSessionToken(""), null);
    assert.equal(readSessionToken("garbage"), null);
  });
});

describe("role permissions", () => {
  it("gives owners everything", () => {
    for (const permission of [
      "products:write",
      "orders:write",
      "discounts:write",
      "settings:write",
      "staff:write",
    ] as const) {
      assert.equal(roleHas("owner", permission), true, permission);
    }
  });

  it("keeps managers out of settings and staff", () => {
    assert.equal(roleHas("manager", "products:write"), true);
    assert.equal(roleHas("manager", "discounts:write"), true);
    assert.equal(roleHas("manager", "settings:write"), false);
    assert.equal(roleHas("manager", "staff:write"), false);
  });

  it("limits staff to fulfilment", () => {
    assert.equal(roleHas("staff", "orders:write"), true);
    assert.equal(roleHas("staff", "products:write"), false);
    assert.equal(roleHas("staff", "discounts:write"), false);
    assert.equal(roleHas("staff", "settings:write"), false);
    assert.equal(roleHas("staff", "staff:write"), false);
  });
});
