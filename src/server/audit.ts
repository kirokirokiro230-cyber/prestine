import { randomUUID } from "node:crypto";
import type { AuditAction, AuditEntry } from "@/lib/types";
import { db, insertInto, unwrap } from "./supabase";
import type { AuditLogRow } from "./database.types";

/**
 * Audit trail.
 *
 * Every mutation records who did what to which entity. On a store with more than
 * one member of staff this is the difference between "the price is wrong" and
 * "the price was changed at 14:12 by this account".
 *
 * Capped at a fixed number of entries so the table cannot grow without bound —
 * the same overflow-delete shape `recordEmail()` in
 * `repositories/email.ts` uses for its own log, for the same reason: a
 * Postgres table has no in-place "keep only the most recent N" the JSON
 * array's `.slice(0, MAX_ENTRIES)` used to give for free.
 */

const MAX_ENTRIES = 500;

function fromRow(row: AuditLogRow): AuditEntry {
  return {
    id: row.id,
    at: row.at,
    actorId: row.actor_id,
    actorEmail: row.actor_email,
    action: row.action,
    entity: row.entity,
    entityId: row.entity_id,
    summary: row.summary,
  };
}

export async function recordAudit(entry: {
  actorId: string | null;
  actorEmail: string;
  action: AuditAction;
  entity: string;
  entityId: string;
  summary: string;
}): Promise<void> {
  unwrap(
    await insertInto(db(), "audit_log", {
      id: `aud_${randomUUID().slice(0, 8)}`,
      actor_id: entry.actorId,
      actor_email: entry.actorEmail,
      action: entry.action,
      entity: entry.entity,
      entity_id: entry.entityId,
      summary: entry.summary,
    }).overrideTypes<unknown, { merge: false }>(),
  );

  const overflow = unwrap(
    await db()
      .from("audit_log")
      .select("id")
      .order("at", { ascending: false })
      .range(MAX_ENTRIES, MAX_ENTRIES + 999)
      .overrideTypes<Array<{ id: string }>, { merge: false }>(),
  );
  if (overflow.length > 0) {
    await db()
      .from("audit_log")
      .delete()
      .in("id", overflow.map((entry) => entry.id));
  }
}

export async function listAudit(limit = 100): Promise<AuditEntry[]> {
  const rows = unwrap(
    await db()
      .from("audit_log")
      .select("*")
      .order("at", { ascending: false })
      .limit(limit)
      .overrideTypes<AuditLogRow[], { merge: false }>(),
  );
  return rows.map(fromRow);
}

/** Recent activity for one entity, shown on its detail page. */
export async function auditFor(entity: string, entityId: string): Promise<AuditEntry[]> {
  const rows = unwrap(
    await db()
      .from("audit_log")
      .select("*")
      .eq("entity", entity)
      .eq("entity_id", entityId)
      .order("at", { ascending: false })
      .overrideTypes<AuditLogRow[], { merge: false }>(),
  );
  return rows.map(fromRow);
}
