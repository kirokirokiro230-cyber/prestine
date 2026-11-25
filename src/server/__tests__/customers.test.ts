import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "@/server/auth";
import {
  createCustomer,
  findCustomerByPhone,
  findCustomerById,
  setCustomerPassword,
} from "@/server/customers";
import { resetLoginAttempts } from "@/server/login-attempts";
import { issueCode, verifyCode } from "@/server/otp";
import { db, insertInto } from "@/server/supabase";
import type { PhoneVerificationRow } from "@/server/database.types";
import { checkSupabaseDatabase, testRunTag } from "./supabase-test-helpers";

/**
 * The customer account repository, exercised end to end through the same OTP engine
 * the signup and reset actions call.
 *
 * Integration test — see `supabase-test-helpers.ts`. Every phone number used here
 * is prefixed with this run's tag so two runs sharing a project cannot collide,
 * and every row created is deleted in a final cleanup pass.
 *
 * `startCustomerSession`/`currentCustomer` are not covered here — they read and write
 * `next/headers` cookies, which only exist inside a request, not in a plain test
 * process. What is covered is everything that matters *before* a cookie is at stake:
 * a code has to verify correctly, the account it creates has to be findable by the
 * number it was created with, and a stolen code cannot be replayed.
 *
 * `issueCode` never hands the plaintext code back to its caller — the whole point is
 * that only the SMS reaches it. So the "code confirms an account" tests write a
 * `phone_verifications` row directly, hashing a known code the same way `issueCode`
 * does, rather than reaching into the SMS driver to recover a real one.
 */

const { configured, reason } = checkSupabaseDatabase();
const tag = testRunTag();
/** E.164 test numbers: a fixed prefix + this run's tag + a per-test suffix. */
function phoneFor(suffix: string): string {
  return `+91${tag.padEnd(10, "0").slice(0, 10)}${suffix}`.slice(0, 15);
}

const createdCustomerIds: string[] = [];
const createdVerificationPhones = new Set<string>();

describe.skipIf(!configured)("customer accounts", () => {
  if (!configured) {
    it.skip(reason, () => {});
    return;
  }

  beforeEach(() => {
    resetLoginAttempts();
  });

  const PASSWORD = "Prestine-Test-1234";

  /** A live, unexpired verification record with a known code, for a given phone/purpose. */
  async function seedVerification(
    phone: string,
    purpose: "signup" | "password-reset",
    code: string,
    pending?: Partial<
      Pick<
        PhoneVerificationRow,
        "pending_name" | "pending_email" | "pending_password_hash" | "pending_password_salt"
      >
    >,
  ): Promise<void> {
    const { hash, salt } = await hashPassword(code);
    createdVerificationPhones.add(phone);
    const { error } = await insertInto(db(), "phone_verifications", {
      id: `otp_test_${phone.slice(-6)}`,
      phone,
      purpose,
      provider: "local",
      code_hash: hash,
      code_salt: salt,
      expires_at: new Date(Date.now() + 60_000).toISOString(),
      attempts: 0,
      ...pending,
    });
    if (error) throw new Error(error.message);
  }

  describe("signup", () => {
    it("issues a code without creating an account", async () => {
      const phone = phoneFor("01");

      const issued = await issueCode({
        phone,
        purpose: "signup",
        pending: {
          name: "Ada Lovelace",
          email: "ada@example.com",
          passwordHash: "irrelevant-for-this-test",
          passwordSalt: "irrelevant-for-this-test",
        },
      });
      expect(issued.ok).toBe(true);
      createdVerificationPhones.add(phone);

      // Nothing written to `customers` yet — only the pending verification record.
      expect(await findCustomerByPhone(phone)).toBeUndefined();
    });

    it("creates the account with the pending name, email and password hash", async () => {
      const phone = phoneFor("02");
      const code = "482913";
      const { hash, salt } = await hashPassword(PASSWORD);

      await seedVerification(phone, "signup", code, {
        pending_name: "Marie Curie",
        pending_email: "marie@example.com",
        pending_password_hash: hash,
        pending_password_salt: salt,
      });

      const verified = await verifyCode(phone, "signup", code);
      expect(verified.ok).toBe(true);
      if (!verified.ok) return;

      const customer = await createCustomer({
        phone: verified.verification.phone,
        name: verified.verification.pendingName ?? "",
        email: verified.verification.pendingEmail,
        passwordHash: verified.verification.pendingPasswordHash!,
        passwordSalt: verified.verification.pendingPasswordSalt!,
        phoneVerifiedAt: new Date().toISOString(),
      });
      createdCustomerIds.push(customer.id);

      expect(customer.name).toBe("Marie Curie");
      expect(customer.email).toBe("marie@example.com");
      expect(customer.phone).toBe(phone);

      const found = await findCustomerByPhone(phone);
      expect(found?.id).toBe(customer.id);
      expect(
        await verifyPassword(PASSWORD, found!.passwordHash, found!.passwordSalt),
      ).toBe(true);
    });

    it("refuses a second account on the same number", async () => {
      const phone = phoneFor("03");
      const first = await createCustomer({
        phone,
        name: "First Account",
        passwordHash: "x",
        passwordSalt: "y",
        phoneVerifiedAt: new Date().toISOString(),
      });
      createdCustomerIds.push(first.id);

      await expect(
        createCustomer({
          phone,
          name: "Someone Else",
          passwordHash: "x",
          passwordSalt: "y",
          phoneVerifiedAt: new Date().toISOString(),
        }),
      ).rejects.toThrow(/already exists/);
    });

    it("consumes the code, so it cannot be replayed", async () => {
      const phone = phoneFor("04");
      const code = "739201";
      await seedVerification(phone, "signup", code, { pending_name: "Once Only" });

      const first = await verifyCode(phone, "signup", code);
      expect(first.ok).toBe(true);

      const second = await verifyCode(phone, "signup", code);
      expect(second.ok).toBe(false);
    });
  });

  describe("password reset", () => {
    it("sets a new password that verifies, and invalidates the old one", async () => {
      const phone = phoneFor("05");
      const { hash, salt } = await hashPassword(PASSWORD);

      const original = await createCustomer({
        phone,
        name: "Reset Me",
        passwordHash: hash,
        passwordSalt: salt,
        phoneVerifiedAt: new Date().toISOString(),
      });
      createdCustomerIds.push(original.id);

      const newPassword = "Another-Test-Password-9";
      await setCustomerPassword(original.id, newPassword);

      const updated = await findCustomerById(original.id);
      expect(updated).toBeDefined();
      expect(
        await verifyPassword(newPassword, updated!.passwordHash, updated!.passwordSalt),
      ).toBe(true);
      // The password that was replaced no longer verifies against the stored hash.
      expect(
        await verifyPassword(PASSWORD, updated!.passwordHash, updated!.passwordSalt),
      ).toBe(false);
    });

    it("rejects a weak new password", async () => {
      const phone = phoneFor("06");
      const customer = await createCustomer({
        phone,
        name: "Weak Password",
        passwordHash: "x",
        passwordSalt: "y",
        phoneVerifiedAt: new Date().toISOString(),
      });
      createdCustomerIds.push(customer.id);

      await expect(setCustomerPassword(customer.id, "short")).rejects.toThrow();
    });

    it("resets via a code, exactly as completePasswordReset would", async () => {
      const phone = phoneFor("07");
      const { hash, salt } = await hashPassword(PASSWORD);
      const customer = await createCustomer({
        phone,
        name: "Via Code",
        passwordHash: hash,
        passwordSalt: salt,
        phoneVerifiedAt: new Date().toISOString(),
      });
      createdCustomerIds.push(customer.id);

      const resetCode = "123456";
      await seedVerification(phone, "password-reset", resetCode);

      const verified = await verifyCode(phone, "password-reset", resetCode);
      expect(verified.ok).toBe(true);
      if (!verified.ok) return;

      const found = await findCustomerByPhone(verified.verification.phone);
      expect(found?.id).toBe(customer.id);

      const newPassword = "Yet-Another-Password-7";
      await setCustomerPassword(found!.id, newPassword);

      const updated = await findCustomerById(customer.id);
      expect(
        await verifyPassword(newPassword, updated!.passwordHash, updated!.passwordSalt),
      ).toBe(true);
    });
  });

  describe("phone normalisation", () => {
    it("finds an account regardless of how the number is typed", async () => {
      const phone = phoneFor("08");
      const created = await createCustomer({
        phone,
        name: "Normalised",
        passwordHash: "x",
        passwordSalt: "y",
        phoneVerifiedAt: new Date().toISOString(),
      });
      createdCustomerIds.push(created.id);

      const digitsOnly = phone.replace(/^\+91/, "");
      expect(await findCustomerByPhone(digitsOnly)).toBeDefined();
      expect(await findCustomerByPhone(`+91 ${digitsOnly}`)).toBeDefined();
    });
  });

  afterAll(async () => {
    if (createdCustomerIds.length > 0) {
      await db().from("customers").delete().in("id", createdCustomerIds);
    }
    if (createdVerificationPhones.size > 0) {
      await db()
        .from("phone_verifications")
        .delete()
        .in("phone", [...createdVerificationPhones]);
    }
  });
});
