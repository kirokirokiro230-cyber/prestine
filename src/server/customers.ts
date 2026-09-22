import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { normalisePhone } from "@/lib/phone";
import type { CustomerAccount } from "@/lib/types";
import { hashPassword, validatePasswordStrength } from "./auth";
import { getDb, isDatabaseConfigured } from "./db/client";
import { fromCustomer, toCustomer } from "./db/mappers";
import { customers as customersTable } from "./db/schema";
import { mutateStore, readStore } from "./store";

/**
 * Shopper accounts.
 *
 * The customer-side counterpart to `auth.ts`. Same shape deliberately: password
 * hashing, the strength policy and the "never distinguish which check failed" posture
 * all come from there rather than being reimplemented here, because two copies of a
 * password check is the kind of duplication that stays in step for about a month.
 *
 * What differs is the identifier. `admins` look each other up by email; a shopper is
 * looked up by phone, normalised to E.164 on every read and write so `+91 98765 43210`
 * and `9876543210` resolve to the same row.
 *
 * Two backends, chosen by whether a database is configured — see `login-attempts.ts`
 * for the precedent.
 */

export async function findCustomerByPhone(
  phone: string,
): Promise<CustomerAccount | undefined> {
  const normalised = normalisePhone(phone);
  if (!normalised) return undefined;

  if (!isDatabaseConfigured()) {
    return (await readStore()).customers.find((customer) => customer.phone === normalised);
  }

  const [row] = await getDb()
    .select()
    .from(customersTable)
    .where(eq(customersTable.phone, normalised));
  return row ? toCustomer(row) : undefined;
}

export async function findCustomerById(
  id: string,
): Promise<CustomerAccount | undefined> {
  if (!isDatabaseConfigured()) {
    return (await readStore()).customers.find((customer) => customer.id === id);
  }

  const [row] = await getDb().select().from(customersTable).where(eq(customersTable.id, id));
  return row ? toCustomer(row) : undefined;
}

export interface CreateCustomerInput {
  phone: string;
  name: string;
  email?: string;
  /** Already hashed by the OTP flow's pending signup — never a plaintext password. */
  passwordHash: string;
  passwordSalt: string;
  /** When the signup code was confirmed. */
  phoneVerifiedAt: string;
}

/**
 * Write a new account.
 *
 * Takes an already-hashed password rather than a plaintext one on purpose: the only
 * caller is the signup flow, which hashes the password the moment it is typed and
 * carries the hash on the pending `PhoneVerification` record until the code confirms.
 * Accepting plaintext here would mean a second path capable of writing a recoverable
 * credential, which is exactly the thing `otp.ts`'s design note warns against.
 */
export async function createCustomer(
  input: CreateCustomerInput,
): Promise<CustomerAccount> {
  const phone = normalisePhone(input.phone);
  if (!phone) throw new Error("Enter a valid mobile number.");

  if (!isDatabaseConfigured()) {
    return mutateStore((store) => {
      if (store.customers.some((customer) => customer.phone === phone)) {
        throw new Error("An account with that number already exists.");
      }

      const customer: CustomerAccount = {
        id: `cus_${randomUUID().slice(0, 8)}`,
        phone,
        name: input.name.trim(),
        email: input.email?.trim().toLowerCase() || undefined,
        passwordHash: input.passwordHash,
        passwordSalt: input.passwordSalt,
        phoneVerifiedAt: input.phoneVerifiedAt,
        createdAt: new Date().toISOString(),
      };

      store.customers.push(customer);
      return customer;
    });
  }

  return getDb().transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: customersTable.id })
      .from(customersTable)
      .where(eq(customersTable.phone, phone));
    if (existing) throw new Error("An account with that number already exists.");

    const customer: CustomerAccount = {
      id: `cus_${randomUUID().slice(0, 8)}`,
      phone,
      name: input.name.trim(),
      email: input.email?.trim().toLowerCase() || undefined,
      passwordHash: input.passwordHash,
      passwordSalt: input.passwordSalt,
      phoneVerifiedAt: input.phoneVerifiedAt,
      createdAt: new Date().toISOString(),
    };

    await tx.insert(customersTable).values(fromCustomer(customer));
    return customer;
  });
}

/**
 * Set a new password.
 *
 * The only writer of `passwordHash`/`passwordSalt` after signup. Used exclusively by
 * the reset flow, and only once `otp.ts` has already confirmed the code — this function
 * itself trusts the caller and does not re-check anything about the phone number.
 */
export async function setCustomerPassword(
  id: string,
  password: string,
): Promise<void> {
  const strength = validatePasswordStrength(password);
  if (strength) throw new Error(strength);

  const { hash, salt } = await hashPassword(password);

  if (!isDatabaseConfigured()) {
    await mutateStore((store) => {
      const customer = store.customers.find((entry) => entry.id === id);
      if (!customer) throw new Error("Account not found.");

      customer.passwordHash = hash;
      customer.passwordSalt = salt;
    });
    return;
  }

  const result = await getDb()
    .update(customersTable)
    .set({ passwordHash: hash, passwordSalt: salt })
    .where(eq(customersTable.id, id))
    .returning({ id: customersTable.id });
  if (result.length === 0) throw new Error("Account not found.");
}

export async function recordCustomerLogin(id: string): Promise<void> {
  if (!isDatabaseConfigured()) {
    await mutateStore((store) => {
      const customer = store.customers.find((entry) => entry.id === id);
      if (customer) customer.lastLoginAt = new Date().toISOString();
    });
    return;
  }

  await getDb()
    .update(customersTable)
    .set({ lastLoginAt: new Date() })
    .where(eq(customersTable.id, id));
}

/**
 * Link a customer to its Supabase Auth identity.
 *
 * Called by the OTP flow after a successful verification, once `ensureAuthUser` has
 * returned the matching `auth.users` id. Idempotent in effect — the value written is the
 * same on every sign-in for a given number — so calling it again on a returning customer
 * simply rewrites the same id. Kept a single-field updater alongside `setCustomerPassword`
 * and `recordCustomerLogin` rather than folded into `createCustomer`, because a returning
 * customer needs it set without a row being created, and an account that predates the
 * bridge gets it backfilled on its next verification.
 *
 * Not allowed to be the thing that fails a sign-in: the caller treats a thrown error as
 * "link it next time" and proceeds. The unique index on `auth_user_id` still holds, so a
 * genuine conflict (the same identity already on another row) surfaces rather than being
 * silently swallowed here.
 */
export async function setCustomerAuthUserId(
  id: string,
  authUserId: string,
): Promise<void> {
  if (!isDatabaseConfigured()) {
    await mutateStore((store) => {
      const customer = store.customers.find((entry) => entry.id === id);
      if (customer) customer.authUserId = authUserId;
    });
    return;
  }

  await getDb()
    .update(customersTable)
    .set({ authUserId })
    .where(eq(customersTable.id, id));
}
