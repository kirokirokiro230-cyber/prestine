/**
 * Scheduled tracking sweep — the thing that makes parcels advance on their own.
 *
 * Delhivery does not tell this app when a parcel moves; the app has to ask. The asking is
 * `POST /api/shipping/sync-tracking` (see `src/server/tracking-sync.ts`), and nothing in
 * a web application wakes up by itself to call it. Without this file, orders stay
 * "processing" until somebody calls that URL by hand: customers are never told their
 * parcel shipped, COD cash is never recorded as collected, the delivered date that opens
 * the returns window is never set, and the "Cancel order" button keeps showing for a
 * parcel that is already on a truck.
 *
 * ## Why this only knocks, and does not do the work
 *
 * A scheduled function has a hard 30-second limit; an ordinary route gets 60. The sweep
 * makes one Delhivery request per 25 waybills and then writes every scan, which for a
 * busy day can run past 30 seconds. Running it in here would mean being killed
 * half-way through a batch. Calling the existing route instead keeps one implementation,
 * one set of auth rules and the longer limit.
 *
 * ## Why every 15 minutes
 *
 * Fast enough that "your order has shipped" is not stale, slow enough to be nowhere near
 * Delhivery's limit (750 requests per five minutes). Each run takes the 50 least recently
 * updated in-flight shipments, so even a large backlog rotates through rather than the
 * same ones being polled forever. UTC, like every Netlify schedule.
 *
 * ## What it needs
 *
 * - `SHIPPING_CRON_SECRET`, or `EMAIL_CRON_SECRET` (the route accepts either, in that
 *   order), set in the Netlify environment for the **Functions** scope. The same value
 *   the route compares against — nothing new to invent.
 * - A production deploy. Netlify runs scheduled functions only on the published deploy,
 *   never on deploy previews or branch deploys. Use "Run now" on the Functions page to
 *   test one.
 *
 * Fails loudly: any non-2xx response throws, which Netlify shows as a failed run in the
 * function log. A sweep that quietly does nothing is the failure this exists to prevent.
 */

/** Plain object rather than `Config` from `@netlify/functions`, to avoid a dependency. */
export const config = {
  schedule: "*/15 * * * *",
};

/** Leaves headroom under Netlify's 30-second ceiling so a slow sweep is logged, not killed. */
const REQUEST_TIMEOUT_MS = 25_000;

interface SweepResult {
  ok?: boolean;
  examined?: number;
  updated?: number;
  delivered?: number;
  ordersAdvanced?: unknown[];
  unknown?: number;
  errors?: Array<{ waybill: string; error: string }>;
  error?: string;
}

function siteOrigin(): string {
  /*
   * `URL` is Netlify's own record of the site's primary address, so it cannot be a
   * leftover placeholder the way `NEXT_PUBLIC_SITE_URL` can (`.env.example` ships
   * `https://your-domain.com`). The public variable is only the fallback.
   */
  const origin = (process.env.URL || process.env.NEXT_PUBLIC_SITE_URL || "")
    .trim()
    .replace(/\/+$/, "");

  if (!origin) {
    throw new Error(
      "Cannot work out the site address: neither URL (set by Netlify) nor NEXT_PUBLIC_SITE_URL is set.",
    );
  }

  return origin;
}

export default async function syncTracking(): Promise<void> {
  const secret = (
    process.env.SHIPPING_CRON_SECRET?.trim() || process.env.EMAIL_CRON_SECRET?.trim()
  );

  if (!secret) {
    // The route would answer 503 anyway; failing here says why in the function log.
    throw new Error(
      "Neither SHIPPING_CRON_SECRET nor EMAIL_CRON_SECRET is set for functions, so the tracking sweep cannot authenticate.",
    );
  }

  const url = `${siteOrigin()}/api/shipping/sync-tracking?limit=50&staleMinutes=10`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      /*
       * Not necessarily a failure: the route keeps working after this call gives up, and
       * the next run picks up whatever it did not reach. Reported as a failure anyway,
       * because a sweep that regularly outruns its trigger wants lowering `limit`.
       */
      throw new Error(
        `The tracking sweep did not answer within ${REQUEST_TIMEOUT_MS / 1000}s. It may still be running; if this repeats, lower the limit in this file.`,
      );
    }
    throw new Error(
      `Could not reach ${new URL(url).origin}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const body = (await response.json().catch(() => null)) as SweepResult | null;

  if (!response.ok) {
    throw new Error(
      `Tracking sweep refused: HTTP ${response.status}${body?.error ? ` — ${body.error}` : ""}`,
    );
  }

  // One line per run, so the Netlify function log reads as a history of sweeps.
  console.log(
    `[tracking] examined=${body?.examined ?? "?"} updated=${body?.updated ?? "?"} ` +
      `delivered=${body?.delivered ?? "?"} advanced=${body?.ordersAdvanced?.length ?? 0} ` +
      `unknown=${body?.unknown ?? 0} errors=${body?.errors?.length ?? 0}`,
  );

  // A partial failure is a 200 with errors listed. Surfaced so it is not invisible.
  for (const failure of body?.errors ?? []) {
    console.error(`[tracking] ${failure.waybill}: ${failure.error}`);
  }
}
