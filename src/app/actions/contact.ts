"use server";

import { randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { isContactTopic } from "@/lib/contact";
import { email as validateEmail } from "@/lib/validation";
import { dispatchContactEmail } from "@/server/email/dispatch";
import { loginLockout, recordFailedLogin } from "@/server/login-attempts";

export interface ContactActionState {
  ok: boolean;
  error?: string;
  fieldErrors?: Partial<Record<"name" | "email" | "topic" | "orderRef" | "message", string>>;
}

async function clientIp(): Promise<string> {
  const list = await headers();
  return (
    list.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    list.get("x-real-ip")?.trim() ||
    "local"
  );
}

/**
 * Deliver one public client-care enquiry.
 *
 * The browser is deliberately not allowed to choose the recipient — the dispatcher
 * always sends to the address in Store Settings. That makes this a contact form, not an
 * open relay. Every field is validated again here even though the client validates for
 * convenience; a server action can be called without using the rendered form at all.
 */
export async function sendContactMessageAction(
  formData: FormData,
): Promise<ContactActionState> {
  // Honeypot. Real users never see or fill this; bots get a convincing success without
  // learning that their submission was discarded.
  if (String(formData.get("website") ?? "").trim()) return { ok: true };

  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const topicValue = String(formData.get("topic") ?? "").trim();
  const topic = isContactTopic(topicValue) ? topicValue : null;
  const orderRef = String(formData.get("orderRef") ?? "").trim().toUpperCase();
  const message = String(formData.get("message") ?? "").trim();

  const fieldErrors: NonNullable<ContactActionState["fieldErrors"]> = {};

  if (!name) fieldErrors.name = "Name is required.";
  else if (name.length > 120) fieldErrors.name = "Keep your name under 120 characters.";

  const emailError = validateEmail(email);
  if (emailError) fieldErrors.email = emailError;

  if (!topic) fieldErrors.topic = "Choose a valid enquiry topic.";

  if (orderRef) {
    if (orderRef.length > 40 || !/^PR-[A-Z0-9-]+$/.test(orderRef)) {
      fieldErrors.orderRef = "Enter a valid order reference, e.g. PR-260612-K4TQ.";
    }
  }

  if (!message) fieldErrors.message = "Message is required.";
  else if (message.length > 5_000) {
    fieldErrors.message = "Keep your message under 5,000 characters.";
  }

  if (Object.keys(fieldErrors).length > 0 || !topic) {
    return { ok: false, error: "Fix the highlighted fields and try again.", fieldErrors };
  }

  const ip = await clientIp();
  const rateKeys = [`contact:ip:${ip}`, `contact:email:${email}`];
  const lockouts = await Promise.all(rateKeys.map(loginLockout));
  if (lockouts.some((entry) => entry.locked)) {
    return {
      ok: false,
      error: "Too many messages were sent recently. Please wait a few minutes and try again.",
    };
  }

  // Count a valid attempt before calling the provider so a failing provider cannot be
  // hammered without consuming the allowance. The limiter is shared across instances in
  // Postgres and prunes itself; see `server/login-attempts.ts`.
  await Promise.all(rateKeys.map(recordFailedLogin));

  try {
    const result = await dispatchContactEmail({
      requestId: randomUUID(),
      name,
      email,
      topic,
      orderRef: orderRef || undefined,
      message,
    });

    if (!result.ok) {
      return {
        ok: false,
        error:
          result.status === "logged"
            ? "Client care email is not configured yet. Please use the email address shown on this page."
            : "We could not deliver your message just now. Please try again or email us directly.",
      };
    }

    return { ok: true };
  } catch (error) {
    console.error("[email] contact enquiry failed:", error);
    return {
      ok: false,
      error: "We could not deliver your message just now. Please try again or email us directly.",
    };
  }
}
