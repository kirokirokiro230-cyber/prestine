import { timingSafeEqual } from "node:crypto";
import { syncTracking } from "@/server/tracking-sync";

/**
 * Scheduled tracking sweep.
 *
 * ## Why this exists as an endpoint
 *
 * A parcel moves on its own. Nothing in a web application wakes up to notice,
 * so something external has to knock — the same reason
 * `src/app/api/email/review-requests/route.ts` exists, and this follows its
 * shape deliberately rather than introducing a second convention.
 *
 * Call it every 15–30 minutes:
 *
 * ```
 * curl -X POST https://your-domain.com/api/shipping/sync-tracking \
 *   -H "Authorization: Bearer $SHIPPING_CRON_SECRET"
 * ```
 *
 * Calling it more often is harmless but wasteful. Every scan is re-read on each
 * poll and absorbed by a unique index, so repeats cannot duplicate history —
 * and `staleMinutes` lets a frequent schedule skip shipments polled moments ago.
 *
 * On Netlify, schedule it with a Scheduled Function or any external cron. On
 * GitHub Actions, the repo already schedules work this way in
 * `.github/workflows/`.
 *
 * ## POST, not GET
 *
 * It writes to the database, so it must never be reachable by something that
 * prefetches links or by a crawler that finds the URL.
 */

export const dynamic = "force-dynamic";

/** Compare in constant time; see the same helper in the review-requests route. */
function secretMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function POST(request: Request): Promise<Response> {
  /*
   * Falls back to EMAIL_CRON_SECRET so an existing deployment keeps working
   * without a second variable, while a shop that wants the two schedules on
   * separate credentials can set SHIPPING_CRON_SECRET and have it take
   * precedence.
   */
  const expected =
    process.env.SHIPPING_CRON_SECRET?.trim() ||
    process.env.EMAIL_CRON_SECRET?.trim();

  /*
   * No secret, no endpoint. This one spends Delhivery request budget and writes
   * shipment history, so an open URL is worth refusing outright. 503 rather
   * than 401 because the fault is configuration, not the caller's credentials.
   */
  if (!expected) {
    return Response.json(
      {
        error:
          "Neither SHIPPING_CRON_SECRET nor EMAIL_CRON_SECRET is set, so this endpoint is disabled.",
      },
      { status: 503 },
    );
  }

  const header = request.headers.get("authorization") ?? "";
  const provided = header.startsWith("Bearer ") ? header.slice(7).trim() : "";

  if (!provided || !secretMatches(provided, expected)) {
    return Response.json({ error: "Unauthorised." }, { status: 401 });
  }

  const url = new URL(request.url);
  const limit = Number(url.searchParams.get("limit") ?? "");
  const staleMinutes = Number(url.searchParams.get("staleMinutes") ?? "");

  try {
    const result = await syncTracking({
      limit: Number.isFinite(limit) && limit > 0 ? Math.min(limit, 500) : undefined,
      staleMinutes:
        Number.isFinite(staleMinutes) && staleMinutes >= 0 ? staleMinutes : undefined,
    });

    /*
     * Reported as a failure when every shipment errored, so a broken token or a
     * Delhivery outage is visible to the scheduler rather than looking like a
     * successful no-op. A partial failure is still a 200 with the errors listed.
     */
    if (result.examined > 0 && result.errors.length === result.examined) {
      console.error("[tracking] sweep failed for every shipment:", result.errors[0]);
      return Response.json({ ...result, ok: false }, { status: 502 });
    }

    return Response.json({ ...result, ok: true });
  } catch (error) {
    console.error("[tracking] sweep failed:", error);
    return Response.json({ error: "Sweep failed." }, { status: 500 });
  }
}
