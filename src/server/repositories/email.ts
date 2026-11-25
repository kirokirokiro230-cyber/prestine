import { randomUUID } from "node:crypto";
import { emailTemplates as seedTemplates } from "@/lib/config";
import type { EmailRecord, EmailTemplate, EmailTemplateKey, Order } from "@/lib/types";
import { db, insertInto, unwrap, updateTable } from "../supabase";
import type { EmailLogRow, EmailTemplateRow } from "../database.types";
import { listOrders } from "./orders";
import { getSettings } from "./settings";

/**
 * Email templates and the send log.
 *
 * Templates behave like settings: seeded once by
 * `supabase/migrations/00000000000004_seed.sql`, then owned by the
 * `email_templates` table so a merchant can rewrite a confirmation without a
 * deploy. The log behaves like the audit trail — append-only, capped, newest
 * first — except the cap is now enforced by `recordEmail` trimming after
 * insert rather than by an in-memory array slice, since a table has no
 * "keep only the first N" primitive of its own.
 */

/**
 * How many send records to keep.
 *
 * Matches the audit cap. Large enough to answer "did last week's orders get their
 * confirmations", small enough that the table does not grow without bound for a
 * store that never prunes it.
 */
const MAX_LOG_ENTRIES = 500;

function templateFromRow(row: EmailTemplateRow): EmailTemplate {
  return {
    key: row.key,
    enabled: row.enabled,
    subject: row.subject,
    heading: row.heading,
    body: row.body,
  };
}

function recordFromRow(row: EmailLogRow): EmailRecord {
  return {
    id: row.id,
    at: row.at,
    to: row.to,
    subject: row.subject,
    templateKey: row.template_key,
    orderId: row.order_id ?? undefined,
    status: row.status,
    error: row.error ?? undefined,
  };
}

export async function listEmailTemplates(): Promise<EmailTemplate[]> {
  const rows = unwrap(
    await db()
      .from("email_templates")
      .select("*")
      .overrideTypes<EmailTemplateRow[], { merge: false }>(),
  );
  return rows.map(templateFromRow);
}

export async function getEmailTemplate(
  key: EmailTemplateKey,
): Promise<EmailTemplate | undefined> {
  const row = unwrap(
    await db()
      .from("email_templates")
      .select("*")
      .eq("key", key)
      .maybeSingle()
      .overrideTypes<EmailTemplateRow, { merge: false }>(),
  );
  return row ? templateFromRow(row) : undefined;
}

export interface EmailTemplateInput {
  enabled: boolean;
  subject: string;
  heading: string;
  body: string;
}

/**
 * Update one template.
 *
 * A subject is required, because a message with no subject line is filtered by most
 * providers before it reaches an inbox. An empty body is allowed: a merchant mid-rewrite
 * should be able to save, and the template can be disabled meanwhile.
 */
export async function updateEmailTemplate(
  key: EmailTemplateKey,
  input: EmailTemplateInput,
): Promise<EmailTemplate> {
  if (!input.subject.trim()) throw new Error("A subject line is required.");

  const row = unwrap(
    await updateTable(db(), "email_templates", {
      enabled: input.enabled,
      subject: input.subject.trim(),
      heading: input.heading.trim(),
      body: input.body,
    })
      .eq("key", key)
      .select("*")
      .single()
      .overrideTypes<unknown, { merge: false }>(),
  ) as EmailTemplateRow | null;

  if (!row) throw new Error(`Email template ${key} not found`);
  return templateFromRow(row);
}

/** Restore the shipped copy for one template, keeping its enabled state. */
export async function resetEmailTemplate(key: EmailTemplateKey): Promise<EmailTemplate> {
  const seeded = seedTemplates.find((entry) => entry.key === key);
  if (!seeded) throw new Error(`Email template ${key} has no default`);

  const row = unwrap(
    await updateTable(db(), "email_templates", {
      subject: seeded.subject,
      heading: seeded.heading,
      body: seeded.body,
      // `enabled` is a deliberate operational choice, not copy. Resetting words
      // should not silently switch an email a merchant turned off back on —
      // omitted here rather than written, so the existing value is untouched.
    })
      .eq("key", key)
      .select("*")
      .single()
      .overrideTypes<unknown, { merge: false }>(),
  ) as EmailTemplateRow | null;

  if (!row) throw new Error(`Email template ${key} not found`);
  return templateFromRow(row);
}

/* ------------------------------------------------------------------ */
/* Log                                                                 */
/* ------------------------------------------------------------------ */

export async function listEmailLog(limit = 100): Promise<EmailRecord[]> {
  const rows = unwrap(
    await db()
      .from("email_log")
      .select("*")
      .order("at", { ascending: false })
      .limit(limit)
      .overrideTypes<EmailLogRow[], { merge: false }>(),
  );
  return rows.map(recordFromRow);
}

/** Send records for one order, newest first. Shown on the admin order page. */
export async function emailLogForOrder(orderId: string): Promise<EmailRecord[]> {
  const rows = unwrap(
    await db()
      .from("email_log")
      .select("*")
      .eq("order_id", orderId)
      .order("at", { ascending: false })
      .overrideTypes<EmailLogRow[], { merge: false }>(),
  );
  return rows.map(recordFromRow);
}

export async function recordEmail(
  entry: Omit<EmailRecord, "id" | "at">,
): Promise<EmailRecord> {
  const row = unwrap(
    await insertInto(db(), "email_log", {
      id: `eml_${randomUUID().slice(0, 8)}`,
      to: entry.to,
      subject: entry.subject,
      template_key: entry.templateKey,
      order_id: entry.orderId ?? null,
      status: entry.status,
      error: entry.error ?? null,
    })
      .select("*")
      .single()
      .overrideTypes<unknown, { merge: false }>(),
  ) as EmailLogRow;

  // Cap the log at MAX_LOG_ENTRIES, oldest rows first. Deleting after insert
  // rather than trimming an in-memory array — a table has no "keep only the
  // most recent N" primitive, so this is one extra query per send, no worse
  // than the audit trail's own equivalent trim in `src/server/audit.ts`.
  const overflow = unwrap(
    await db()
      .from("email_log")
      .select("id")
      .order("at", { ascending: false })
      .range(MAX_LOG_ENTRIES, MAX_LOG_ENTRIES + 999)
      .overrideTypes<Array<{ id: string }>, { merge: false }>(),
  );
  if (overflow.length > 0) {
    await db()
      .from("email_log")
      .delete()
      .in("id", overflow.map((entry) => entry.id));
  }

  return recordFromRow(row);
}

/* ------------------------------------------------------------------ */
/* Review request queue                                                */
/* ------------------------------------------------------------------ */

/**
 * Mark the review request as sent.
 *
 * Written *before* the send is attempted, not after. If the provider call fails the
 * customer gets no email, which is recoverable; if the process dies between a successful
 * send and this write, the queue would offer the same order again on the next sweep and
 * ask twice. Asking twice is the worse failure, and the log records the attempt either
 * way so a genuine miss is still visible.
 */
export async function markReviewRequested(orderId: string): Promise<void> {
  const { error } = await updateTable(db(), "orders", {
    review_requested_at: new Date().toISOString(),
  }).eq("id", orderId);
  if (error) throw new Error(error.message);
}

/**
 * Delivered orders whose review request is due and not yet sent.
 *
 * "Due" is `deliveredAt` plus `settings.reviewRequestDelayDays`. An order with no
 * `deliveredAt` is skipped rather than treated as due immediately — that combination
 * means a legacy record, and a review request for an order from before the feature
 * existed is spam.
 *
 * An order with no email address is also skipped. Legacy orders predate the checkout
 * capturing one, and there is nowhere to send it.
 *
 * The `status = 'delivered' and review_requested_at is null` half of this filter is
 * exactly what `orders_review_due_idx` (a partial index — see
 * `supabase/migrations/00000000000001_schema.sql`) was built for; the delay-day
 * arithmetic still has to happen in application code because it depends on the
 * live `settings.review_request_delay_days`, which cannot be baked into the index.
 */
export async function dueReviewRequests(now = new Date()): Promise<Order[]> {
  const settings = await getSettings();
  const delayMs = Math.max(0, settings.reviewRequestDelayDays) * 86_400_000;

  const orders = await listOrders();

  return orders.filter((order) => {
    if (order.status !== "delivered") return false;
    if (order.reviewRequestedAt) return false;
    if (!order.email) return false;
    if (!order.deliveredAt) return false;

    const deliveredAt = Date.parse(order.deliveredAt);
    if (Number.isNaN(deliveredAt)) return false;

    return deliveredAt + delayMs <= now.getTime();
  });
}
