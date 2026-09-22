import { rmSync } from "node:fs";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "@/server/auth";
import {
  createCustomer,
  findCustomerByPhone,
  findCustomerById,
  setCustomerPassword,
} from "@/server/customers";
import { resetLoginAttempts } from "@/server/login-attempts";
import { issueCode, verifyCode } from "@/server/otp";
import { mutateStore } from "@/server/store";
import type { PhoneVerification } from "@/lib/types";

/**
 * The customer account repository, exercised end to end through the same OTP engine
 * the signup and reset actions call.
 *
 * `startCustomerSession`/`currentCustomer` are not covered here — they read and write
 * `next/headers` cookies, which only exist inside a request, not in a plain test
 * process. What is covered is everything that matters *before* a cookie is at stake:
 * a code has to verify correctly, the account it creates has to be findable by the
 * number it was created with, and a stolen code cannot be replayed.
 *
 * `issueCode` never hands the plaintext code back to its caller — the whole point is
 * that only the SMS reaches it. So the "code confirms an account" tests write a
 * `PhoneVerification` row directly, hashing a known code the same way `issueCode`
 * does, rather than reaching into the SMS driver to recover a real one.
 */

beforeAll(() => {
  const path = ".test-store/customers.json";
  process.env.PRESTINE_STORE_PATH = path;
  rmSync(path, { force: true });
});

beforeEach(() => {
  resetLoginAttempts();
  delete process.env.DATABASE_URL;
});

const PASSWORD = "Prestine-Test-1234";

/** A live, unexpired verification record with a known code, for a given phone/purpose. */
async function seedVerification(
  phone: string,
  purpose: PhoneVerification["purpose"],
  code: string,
  pending?: Partial<PhoneVerification>,
): Promise<void> {
  const { hash, salt } = await hashPassword(code);
  await mutateStore((store) => {
    store.phoneVerifications.push({
      id: `otp_${phone.slice(-4)}`,
      phone,
      purpose,
      provider: "local",
      codeHash: hash,
      codeSalt: salt,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      attempts: 0,
      createdAt: new Date().toISOString(),
      ...pending,
    });
  });
}

describe("signup", () => {
  it("issues a code without creating an account", async () => {
    const phone = "+919876500001";

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

    // Nothing written to `customers` yet — only the pending verification record.
    expect(await findCustomerByPhone(phone)).toBeUndefined();
  });

  it("creates the account with the pending name, email and password hash", async () => {
    const phone = "+919876500002";
    const code = "482913";
    const { hash, salt } = await hashPassword(PASSWORD);

    await seedVerification(phone, "signup", code, {
      pendingName: "Marie Curie",
      pendingEmail: "marie@example.com",
      pendingPasswordHash: hash,
      pendingPasswordSalt: salt,
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
    const phone = "+919876500002"; // reused from the previous test
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
    const phone = "+919876500003";
    const code = "739201";
    await seedVerification(phone, "signup", code, {
      pendingName: "Once Only",
    });

    const first = await verifyCode(phone, "signup", code);
    expect(first.ok).toBe(true);

    const second = await verifyCode(phone, "signup", code);
    expect(second.ok).toBe(false);
  });
});

describe("password reset", () => {
  it("sets a new password that verifies, and invalidates the old one", async () => {
    const phone = "+919876500004";
    const { hash, salt } = await hashPassword(PASSWORD);

    const original = await createCustomer({
      phone,
      name: "Reset Me",
      passwordHash: hash,
      passwordSalt: salt,
      phoneVerifiedAt: new Date().toISOString(),
    });

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
    const phone = "+919876500005";
    const customer = await createCustomer({
      phone,
      name: "Weak Password",
      passwordHash: "x",
      passwordSalt: "y",
      phoneVerifiedAt: new Date().toISOString(),
    });

    await expect(setCustomerPassword(customer.id, "short")).rejects.toThrow();
  });

  it("resets via a code, exactly as completePasswordReset would", async () => {
    const phone = "+919876500006";
    const { hash, salt } = await hashPassword(PASSWORD);
    const customer = await createCustomer({
      phone,
      name: "Via Code",
      passwordHash: hash,
      passwordSalt: salt,
      phoneVerifiedAt: new Date().toISOString(),
    });

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
    const phone = "+919876500007";
    await createCustomer({
      phone,
      name: "Normalised",
      passwordHash: "x",
      passwordSalt: "y",
      phoneVerifiedAt: new Date().toISOString(),
    });

    expect(await findCustomerByPhone("9876500007")).toBeDefined();
    expect(await findCustomerByPhone("+91 98765 00007")).toBeDefined();
  });
});
