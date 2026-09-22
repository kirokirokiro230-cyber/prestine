import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import type { AuditAction, AuditEntry } from "@/lib/types";
import { getDb, isDatabaseConfigured } from "./db/client";
import { fromAuditEntry, toAuditEntry } from "./db/mappers";
import { auditLog } from "./db/schema";
import { mutateStore, readStore } from "./store";

/**
 * Audit trail.
 *
 * Every mutation records who did what to which entity. On a store with more than
 * one member of staff this is the difference between "the price is wrong" and
 * "the price was changed at 14:12 by this account".
 *
 * Capped at a fixed number of entries so the store cannot grow without bound. Two
 * backends, chosen by whether a database is configured — see `login-attempts.ts`
 * for the precedent.
 */

const MAX_ENTRIES = 500;

export async function recordAudit(entry: {
  actorId: string | null;
  actorEmail: string;
  action: AuditAction;
  entity: string;
  entityId: string;
  summary: string;
}): Promise<void> {
  const audit: AuditEntry = {
    id: `aud_${randomUUID().slice(0, 8)}`,
    at: new Date().toISOString(),
    ...entry,
  };

  if (!isDatabaseConfigured()) {
    await mutateStore((store) => {
      store.audit.unshift(audit);
      if (store.audit.length > MAX_ENTRIES) {
        store.audit = store.audit.slice(0, MAX_ENTRIES);
      }
    });
    return;
  }

  const db = getDb();
  await db.insert(auditLog).values(fromAuditEntry(audit));

  // Cap the table the same way the JSON store caps the array: keep the newest
  // MAX_ENTRIES rows, drop the rest.
  const overflow = await db
    .select({ id: auditLog.id })
    .from(auditLog)
    .orderBy(desc(auditLog.at))
    .offset(MAX_ENTRIES);
  for (const row of overflow) {
    await db.delete(auditLog).where(eq(auditLog.id, row.id));
  }
}

export async function listAudit(limit = 100): Promise<AuditEntry[]> {
  if (!isDatabaseConfigured()) {
    return (await readStore()).audit.slice(0, limit);
  }

  const rows = await getDb().select().from(auditLog).orderBy(desc(auditLog.at)).limit(limit);
  return rows.map(toAuditEntry);
}

/** Recent activity for one entity, shown on its detail page. */
export async function auditFor(entity: string, entityId: string): Promise<AuditEntry[]> {
  if (!isDatabaseConfigured()) {
    const { audit } = await readStore();
    return audit.filter((entry) => entry.entity === entity && entry.entityId === entityId);
  }

  const rows = await getDb()
    .select()
    .from(auditLog)
    .where(and(eq(auditLog.entity, entity), eq(auditLog.entityId, entityId)));
  return rows.map(toAuditEntry);
}
