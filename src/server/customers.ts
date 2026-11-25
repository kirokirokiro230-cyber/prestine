import { randomUUID } from "node:crypto";
import { normalisePhone } from "@/lib/phone";
import type { CustomerAccount } from "@/lib/types";
import { hashPassword, validatePasswordStrength } from "./auth";
import { db, insertInto, unwrap, updateTable } from "./supabase";
import type { CustomerRow } from "./database.types";

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
 */

function fromRow(row: CustomerRow): CustomerAccount {
  return {
    id: row.id,
    phone: row.phone,
    name: row.name,
    email: row.email ?? undefined,
    passwordHash: row.password_hash,
    passwordSalt: row.password_salt,
    phoneVerifiedAt: row.phone_verified_at,
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at ?? undefined,
    disabled: row.disabled,
  };
}

export async function findCustomerByPhone(
  phone: string,
): Promise<CustomerAccount | undefined> {
  const normalised = normalisePhone(phone);
  if (!normalised) return undefined;

  const row = unwrap(
    await db()
      .from("customers")
      .select("*")
      .eq("phone", normalised)
      .maybeSingle()
      .overrideTypes<CustomerRow, { merge: false }>(),
  );
  return row ? fromRow(row) : undefined;
}

export async function findCustomerById(
  id: string,
): Promise<CustomerAccount | undefined> {
  const row = unwrap(
    await db()
      .from("customers")
      .select("*")
      .eq("id", id)
      .maybeSingle()
      .overrideTypes<CustomerRow, { merge: false }>(),
  );
  return row ? fromRow(row) : undefined;
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

  const existing = await findCustomerByPhone(phone);
  if (existing) throw new Error("An account with that number already exists.");

  const row = unwrap(
    await insertInto(db(), "customers", {
      id: `cus_${randomUUID().slice(0, 8)}`,
      phone,
      name: input.name.trim(),
      email: input.email?.trim().toLowerCase() || null,
      password_hash: input.passwordHash,
      password_salt: input.passwordSalt,
      phone_verified_at: input.phoneVerifiedAt,
    })
      .select("*")
      .single()
      .overrideTypes<unknown, { merge: false }>(),
  ) as CustomerRow;

  return fromRow(row);
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

  const { data, error } = await updateTable(db(), "customers", {
    password_hash: hash,
    password_salt: salt,
  })
    .eq("id", id)
    .select("id");

  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error("Account not found.");
}

export async function recordCustomerLogin(id: string): Promise<void> {
  const { error } = await updateTable(db(), "customers", {
    last_login_at: new Date().toISOString(),
  }).eq("id", id);
  if (error) throw new Error(error.message);
}
