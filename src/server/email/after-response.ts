import { after } from "next/server";

/**
 * Run background work once the response has been sent.
 *
 * ## Why not call `after` directly
 *
 * `after()` needs a request scope and throws synchronously without one. That is correct
 * behaviour, but it means any code path that calls a server action outside a request —
 * the test suite calling `placeOrder` directly, or a maintenance script — crashes on a
 * line whose entire purpose was to do something *optional* after the fact.
 *
 * A confirmation email must never be the reason an order fails. So the fallback is to run
 * the work anyway, detached: outside a request there is no response to be "after", and
 * doing it immediately is the faithful reading of the intent.
 *
 * ## Why the promise is allowed to float
 *
 * Everything passed here is already required not to reject — see the contract on
 * `dispatchOrderEmail`. Awaiting would mean the caller pays the latency, which is exactly
 * what using `after` was avoiding, and there is nothing useful to do with the result.
 * The `.catch` is belt-and-braces so a future caller that breaks the contract produces a
 * log line rather than an unhandled rejection that some hosts treat as fatal.
 */
export function afterResponse(work: () => Promise<unknown>): void {
  try {
    after(work);
  } catch {
    // No request scope — a test, a script, or a call from outside the request lifecycle.
    void work().catch((error) => {
      console.error("[email] background work failed outside a request scope:", error);
    });
  }
}
