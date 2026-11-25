"use server";

import { markNotificationsSeen } from "@/server/notifications";
import { PermissionError, requirePermission } from "@/server/session";

/**
 * Mark every notification up to now as read, for the signed-in admin only.
 *
 * Per person: one admin clearing their bell must not clear everyone else's. The server
 * action origin check covers cross-site posts, and the admin cookie is SameSite=strict,
 * so there is no separate CSRF token to manage.
 *
 * Takes no input. The identity comes from the session, never from the request, so one
 * admin cannot mark another's notifications as read by naming them.
 */
export async function markNotificationsReadAction(): Promise<{ ok: boolean }> {
  try {
    const admin = await requirePermission("orders:write");
    await markNotificationsSeen(admin.id);
    return { ok: true };
  } catch (error) {
    if (!(error instanceof PermissionError)) {
      console.error("[notifications] could not mark as read:", error);
    }
    return { ok: false };
  }
}
