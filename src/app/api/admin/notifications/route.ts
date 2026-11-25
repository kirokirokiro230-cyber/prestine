import { NextResponse } from "next/server";
import { notificationFeed } from "@/server/notifications";
import { PermissionError, requirePermission } from "@/server/session";

/**
 * The admin bell's feed. Polled every few seconds by the admin header.
 *
 * ## Authorisation
 *
 * `proxy.ts` guards `/admin/*` pages, and this lives under `/api`, so the proxy does not
 * protect it. The session is checked here, on the server, the same way every admin
 * mutation does it. The feed carries customer names, cities and order totals; an
 * unauthenticated read of it would be a data leak.
 *
 * `orders:write` is held by every role (owner, manager and staff), which is the right bar:
 * everyone who can act on an order should hear about it, and no one who cannot sign in
 * should.
 *
 * ## Caching
 *
 * `no-store` on every response, including errors. A shared cache holding one admin's feed
 * and serving it to another is the failure this header prevents.
 */
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(): Promise<Response> {
  try {
    const admin = await requirePermission("orders:write");
    const feed = await notificationFeed(admin.id);

    return NextResponse.json(feed, { headers: NO_STORE });
  } catch (error) {
    if (error instanceof PermissionError) {
      return NextResponse.json({ error: "Not authorised." }, { status: 401, headers: NO_STORE });
    }

    console.error("[notifications] feed failed:", error);
    return NextResponse.json({ error: "Could not load notifications." }, { status: 500, headers: NO_STORE });
  }
}
