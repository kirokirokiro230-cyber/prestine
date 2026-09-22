import { timingSafeEqual } from "node:crypto";
import { dispatchDueReviewRequests } from "@/server/email/dispatch";

/**
 * Scheduled sweep for due review requests.
 *
 * ## Why this exists as an endpoint
 *
 * A review request is the one email that is not caused by someone clicking something — it
 * becomes due on its own, some days after delivery. Nothing in a web application wakes up
 * on its own, so something external has to knock. The repo already schedules work this way
 * in `.github/workflows/keep-database-awake.yml`, so this follows that precedent rather
 * than introducing a scheduler.
 *
 * Call it about once a day:
 *
 * ```
 * curl -X POST https://your-domain.com/api/email/review-requests \
 *   -H "Authorization: Bearer $EMAIL_CRON_SECRET"
 * ```
 *
 * Calling it more often is harmless. The queue is claimed per order before sending, so a
 * second call while the first is still running cannot send the same request twice.
 *
 * ## POST, not GET
 *
 * It sends email, so it is not safe in the HTTP sense and must never be reachable by
 * something that prefetches links or by a crawler that found the URL.
 */

export const dynamic = "force-dynamic";

/**
 * Compare in constant time.
 *
 * A plain `===` on a secret leaks its length and, in principle, its prefix through timing.
 * Cheap to do properly, and the lengths are compared first because `timingSafeEqual`
 * throws on a mismatch rather than returning false.
 */
function secretMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function POST(request: Request): Promise<Response> {
  const expected = process.env.EMAIL_CRON_SECRET?.trim();

  /*
   * No secret, no endpoint. Refusing outright rather than running unauthenticated: this
   * triggers outbound email to real customers, and an open URL that does that is an open
   * relay pointed at your own order book. 503 rather than 401 because the fault is
   * configuration, not the caller's credentials.
   */
  if (!expected) {
    return Response.json(
      { error: "EMAIL_CRON_SECRET is not set, so this endpoint is disabled." },
      { status: 503 },
    );
  }

  const header = request.headers.get("authorization") ?? "";
  const provided = header.startsWith("Bearer ") ? header.slice(7).trim() : "";

  if (!provided || !secretMatches(provided, expected)) {
    return Response.json({ error: "Unauthorised." }, { status: 401 });
  }

  try {
    const { sent, skipped } = await dispatchDueReviewRequests();
    return Response.json({ sent, skipped });
  } catch (error) {
    // Logged, and reported as a failure so a failing schedule is visible to whatever
    // is calling it rather than looking like a successful no-op.
    console.error("[email] review request sweep failed:", error);
    return Response.json({ error: "Sweep failed." }, { status: 500 });
  }
}
