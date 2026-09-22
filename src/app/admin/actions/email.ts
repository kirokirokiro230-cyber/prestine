"use server";

import { revalidatePath } from "next/cache";
import type { EmailTemplateKey } from "@/lib/types";
import { email as validateEmail } from "@/lib/validation";
import { recordAudit } from "@/server/audit";
import {
  dispatchCustomEmail,
  dispatchDueReviewRequests,
} from "@/server/email/dispatch";
import {
  resetEmailTemplate,
  updateEmailTemplate,
} from "@/server/repositories/email";
import { PermissionError, requirePermission } from "@/server/session";

/**
 * Email template editing and ad-hoc sends.
 *
 * ## Two permissions, on purpose
 *
 * Editing a template is `settings:write` — it changes what every future customer receives,
 * which is configuration. Sending one message is `orders:write`, because that is customer
 * service and the people doing it are the ones handling orders. A shop where the only
 * person who can reply to a customer is the owner is a shop that replies slowly.
 */

export interface EmailActionState {
  error?: string;
  success?: string;
  fieldErrors?: Record<string, string>;
}

const TEMPLATE_KEYS: EmailTemplateKey[] = [
  "order-confirmation",
  "out-for-delivery",
  "delivered",
  "review-request",
  "order-cancelled",
];

/** Reject anything that is not a known key rather than trusting the form field. */
function templateKeyFrom(value: FormDataEntryValue | null): EmailTemplateKey | null {
  const key = String(value ?? "") as EmailTemplateKey;
  return TEMPLATE_KEYS.includes(key) ? key : null;
}

function revalidateEmail(): void {
  revalidatePath("/admin/email");
}

/* ------------------------------- Templates -------------------------------- */

export async function saveEmailTemplateAction(
  _previous: EmailActionState,
  formData: FormData,
): Promise<EmailActionState> {
  try {
    const admin = await requirePermission("settings:write");

    const key = templateKeyFrom(formData.get("key"));
    if (!key) return { error: "Unknown email template." };

    const subject = String(formData.get("subject") ?? "").trim();
    if (!subject) {
      return {
        fieldErrors: { subject: "A subject line is required." },
        error: "Fix the highlighted field and try again.",
      };
    }

    await updateEmailTemplate(key, {
      /*
       * An unchecked checkbox sends nothing at all, so absence means off. Reading it as
       * `=== "on"` rather than `!== "off"` here — unlike the order notify flag — because
       * this form always renders the checkbox, so absence is unambiguous.
       */
      enabled: formData.get("enabled") === "on",
      subject,
      heading: String(formData.get("heading") ?? ""),
      body: String(formData.get("body") ?? ""),
    });

    await recordAudit({
      actorId: admin.id,
      actorEmail: admin.email,
      action: "update",
      entity: "email-template",
      entityId: key,
      summary: `Updated the ${key} email`,
    });

    revalidateEmail();
    return { success: "Email saved." };
  } catch (error) {
    if (error instanceof PermissionError) return { error: error.message };
    return { error: (error as Error).message };
  }
}

export async function resetEmailTemplateAction(formData: FormData): Promise<void> {
  const admin = await requirePermission("settings:write");

  const key = templateKeyFrom(formData.get("key"));
  if (!key) return;

  await resetEmailTemplate(key);
  await recordAudit({
    actorId: admin.id,
    actorEmail: admin.email,
    action: "update",
    entity: "email-template",
    entityId: key,
    summary: `Restored the default ${key} email copy`,
  });

  revalidateEmail();
}

/* ------------------------------ Ad-hoc send ------------------------------- */

export async function sendCustomEmailAction(
  _previous: EmailActionState,
  formData: FormData,
): Promise<EmailActionState> {
  try {
    const admin = await requirePermission("orders:write");

    const to = String(formData.get("to") ?? "").trim().toLowerCase();
    const subject = String(formData.get("subject") ?? "").trim();
    const heading = String(formData.get("heading") ?? "").trim();
    const body = String(formData.get("body") ?? "");
    const orderId = String(formData.get("orderId") ?? "").trim();

    const fieldErrors: Record<string, string> = {};

    // Same validator the checkout uses, so a recipient that would be accepted at
    // checkout is accepted here and vice versa.
    const addressError = validateEmail(to);
    if (addressError) fieldErrors.to = addressError;
    if (!subject) fieldErrors.subject = "A subject line is required.";
    if (!body.trim()) fieldErrors.body = "Write something to send.";

    if (Object.keys(fieldErrors).length > 0) {
      return { fieldErrors, error: "Fix the highlighted fields and try again." };
    }

    const result = await dispatchCustomEmail({
      to,
      subject,
      heading,
      body,
      orderId: orderId || undefined,
    });

    await recordAudit({
      actorId: admin.id,
      actorEmail: admin.email,
      action: "create",
      entity: "email",
      entityId: orderId || to,
      summary: `Sent “${subject}” to ${to}`,
    });

    revalidateEmail();

    if (!result.ok) {
      return { error: `The provider refused the message. ${result.error ?? ""}`.trim() };
    }

    /*
     * `logged` is reported as exactly what it is. Telling a merchant their message was
     * sent when no provider is configured means they wait for a reply that can never
     * come, and only find out when the customer complains twice.
     */
    return {
      success:
        result.status === "logged"
          ? `Recorded, but not delivered — no email provider is configured. See the setup note above.`
          : `Sent to ${to}.`,
    };
  } catch (error) {
    if (error instanceof PermissionError) return { error: error.message };
    return { error: (error as Error).message };
  }
}

/* --------------------------- Review request sweep -------------------------- */

/**
 * Send every review request that has come due, now.
 *
 * The same sweep the scheduled endpoint runs. Exposed as a button because a store with no
 * cron configured would otherwise never send one, and a feature that silently depends on
 * infrastructure nobody set up is a feature that does not exist.
 */
/*
 * Takes no arguments. `useActionState` calls it with `(state, formData)` and a function
 * may declare fewer parameters than it is called with, so the signature says what is
 * actually true — this action reads nothing from the form, because the queue is the input.
 */
export async function sendDueReviewRequestsAction(): Promise<EmailActionState> {
  try {
    const admin = await requirePermission("orders:write");

    const { sent, skipped } = await dispatchDueReviewRequests();

    if (sent > 0) {
      await recordAudit({
        actorId: admin.id,
        actorEmail: admin.email,
        action: "create",
        entity: "email",
        entityId: "review-request",
        summary: `Sent ${sent} review request${sent === 1 ? "" : "s"}`,
      });
    }

    revalidateEmail();

    if (skipped > 0) {
      return {
        error: `${skipped} order${skipped === 1 ? " is" : "s are"} due, but the review request email is switched off.`,
      };
    }

    return {
      success:
        sent === 0
          ? "Nothing is due yet."
          : `Sent ${sent} review request${sent === 1 ? "" : "s"}.`,
    };
  } catch (error) {
    if (error instanceof PermissionError) return { error: error.message };
    return { error: (error as Error).message };
  }
}
