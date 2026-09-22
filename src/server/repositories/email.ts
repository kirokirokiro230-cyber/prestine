import { randomUUID } from "node:crypto";
import { and, desc, eq, isNull, lte } from "drizzle-orm";
import { emailTemplates as seedTemplates } from "@/lib/config";
import type { EmailRecord, EmailTemplate, EmailTemplateKey, Order } from "@/lib/types";
import { getDb, isDatabaseConfigured } from "../db/client";
import { fromEmailRecord, fromEmailTemplate, toEmailRecord, toEmailTemplate, toOrder } from "../db/mappers";
import { emailLog, emailTemplates, orderLines, orders as ordersTable } from "../db/schema";
import { getSettings } from "./settings";
import { mutateStore, readStore } from "../store";

/**
 * Email templates and the send log.
 *
 * Templates behave like settings: seeded from `config.ts`, then owned by the store so a
 * merchant can rewrite a confirmation without a deploy. The log behaves like the audit
 * trail — append-only, capped, newest first.
 *
 * Two backends, chosen by whether a database is configured — see `login-attempts.ts`
 * for the precedent.
 */

/**
 * How many send records to keep.
 *
 * Matches the audit cap. Large enough to answer "did last week's orders get their
 * confirmations", small enough that the JSON document does not grow without bound —
 * the whole store is rewritten on every mutation, so an uncapped log would make every
 * admin action progressively slower. Against Postgres the same cap keeps the admin
 * log page fast without needing an index-only scan of the whole table.
 */
const MAX_LOG_ENTRIES = 500;

export async function listEmailTemplates(): Promise<EmailTemplate[]> {
  if (!isDatabaseConfigured()) {
    return [...(await readStore()).emailTemplates];
  }

  const rows = await getDb().select().from(emailTemplates);
  return rows.map(toEmailTemplate);
}

export async function getEmailTemplate(
  key: EmailTemplateKey,
): Promise<EmailTemplate | undefined> {
  if (!isDatabaseConfigured()) {
    return (await readStore()).emailTemplates.find((template) => template.key === key);
  }

  const [row] = await getDb().select().from(emailTemplates).where(eq(emailTemplates.key, key));
  return row ? toEmailTemplate(row) : undefined;
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

  if (!isDatabaseConfigured()) {
    return mutateStore((store) => {
      const template = store.emailTemplates.find((entry) => entry.key === key);
      if (!template) throw new Error(`Email template ${key} not found`);

      template.enabled = input.enabled;
      template.subject = input.subject.trim();
      template.heading = input.heading.trim();
      template.body = input.body;

      return template;
    });
  }

  const next: EmailTemplate = {
    key,
    enabled: input.enabled,
    subject: input.subject.trim(),
    heading: input.heading.trim(),
    body: input.body,
  };

  const [row] = await getDb()
    .update(emailTemplates)
    .set(fromEmailTemplate(next))
    .where(eq(emailTemplates.key, key))
    .returning();
  if (!row) throw new Error(`Email template ${key} not found`);
  return toEmailTemplate(row);
}

/** Restore the shipped copy for one template, keeping its enabled state. */
export async function resetEmailTemplate(key: EmailTemplateKey): Promise<EmailTemplate> {
  const seeded = seedTemplates.find((entry) => entry.key === key);
  if (!seeded) throw new Error(`Email template ${key} has no default`);

  if (!isDatabaseConfigured()) {
    return mutateStore((store) => {
      const template = store.emailTemplates.find((entry) => entry.key === key);
      if (!template) throw new Error(`Email template ${key} not found`);

      template.subject = seeded.subject;
      template.heading = seeded.heading;
      template.body = seeded.body;
      // `enabled` is a deliberate operational choice, not copy. Resetting words should
      // not silently switch an email a merchant turned off back on.

      return template;
    });
  }

  const db = getDb();
  const [current] = await db.select().from(emailTemplates).where(eq(emailTemplates.key, key));
  if (!current) throw new Error(`Email template ${key} not found`);

  const next: EmailTemplate = {
    key,
    // `enabled` is a deliberate operational choice, not copy — carried over, not reset.
    enabled: current.enabled,
    subject: seeded.subject,
    heading: seeded.heading,
    body: seeded.body,
  };

  const [row] = await db
    .update(emailTemplates)
    .set(fromEmailTemplate(next))
    .where(eq(emailTemplates.key, key))
    .returning();
  return toEmailTemplate(row);
}

/* ------------------------------------------------------------------ */
/* Log                                                                 */
/* ------------------------------------------------------------------ */

export async function listEmailLog(limit = 100): Promise<EmailRecord[]> {
  if (!isDatabaseConfigured()) {
    return (await readStore()).emailLog.slice(0, limit);
  }

  const rows = await getDb().select().from(emailLog).orderBy(desc(emailLog.at)).limit(limit);
  return rows.map(toEmailRecord);
}

/** Send records for one order, newest first. Shown on the admin order page. */
export async function emailLogForOrder(orderId: string): Promise<EmailRecord[]> {
  if (!isDatabaseConfigured()) {
    return (await readStore()).emailLog.filter((entry) => entry.orderId === orderId);
  }

  const rows = await getDb()
    .select()
    .from(emailLog)
    .where(eq(emailLog.orderId, orderId))
    .orderBy(desc(emailLog.at));
  return rows.map(toEmailRecord);
}

export async function recordEmail(
  entry: Omit<EmailRecord, "id" | "at">,
): Promise<EmailRecord> {
  const record: EmailRecord = {
    id: `eml_${randomUUID().slice(0, 8)}`,
    at: new Date().toISOString(),
    ...entry,
  };

  if (!isDatabaseConfigured()) {
    return mutateStore((store) => {
      store.emailLog.unshift(record);
      if (store.emailLog.length > MAX_LOG_ENTRIES) {
        store.emailLog = store.emailLog.slice(0, MAX_LOG_ENTRIES);
      }
      return record;
    });
  }

  const db = getDb();
  await db.insert(emailLog).values(fromEmailRecord(record));

  // Cap the table the same way the JSON store caps the array: keep the newest
  // MAX_LOG_ENTRIES rows, drop the rest. Cheap here because it only runs on a write,
  // not on every read.
  const overflow = await db
    .select({ id: emailLog.id })
    .from(emailLog)
    .orderBy(desc(emailLog.at))
    .offset(MAX_LOG_ENTRIES);
  if (overflow.length > 0) {
    for (const row of overflow) {
      await db.delete(emailLog).where(eq(emailLog.id, row.id));
    }
  }

  return record;
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
  if (!isDatabaseConfigured()) {
    await mutateStore((store) => {
      const order = store.orders.find((entry) => entry.id === orderId);
      if (order) order.reviewRequestedAt = new Date().toISOString();
    });
    return;
  }

  await getDb()
    .update(ordersTable)
    .set({ reviewRequestedAt: new Date() })
    .where(eq(ordersTable.id, orderId));
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
 */
export async function dueReviewRequests(now = new Date()): Promise<Order[]> {
  if (!isDatabaseConfigured()) {
    const { orders, settings } = await readStore();
    const delayMs = Math.max(0, settings.reviewRequestDelayDays) * 86_400_000;

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

  const settings = await getSettings();
  const delayMs = Math.max(0, settings.reviewRequestDelayDays) * 86_400_000;
  const cutoff = new Date(now.getTime() - delayMs);

  const db = getDb();
  const rows = await db
    .select()
    .from(ordersTable)
    .where(
      and(
        eq(ordersTable.status, "delivered"),
        isNull(ordersTable.reviewRequestedAt),
        lte(ordersTable.deliveredAt, cutoff),
      ),
    );

  // `email` is nullable and not filterable with a plain `isNotNull` combined cleanly
  // above without a second round trip either way, so it is checked here alongside the
  // "legacy record" skip that a missing `deliveredAt` also needs — both are the same
  // "this row predates the feature" case the JSON-store branch names explicitly.
  const withEmail = rows.filter((row) => Boolean(row.email) && row.deliveredAt !== null);
  if (withEmail.length === 0) return [];

  const lines = await db.select().from(orderLines);
  return withEmail.map((row) =>
    toOrder(row, lines.filter((line) => line.orderId === row.id)),
  );
}
