/**
 * The animated confirmation mark.
 *
 * A drawn tick rather than a static icon, because this is the one moment in the
 * whole flow worth marking — the shopper has just committed money and wants to
 * be told, unambiguously, that it worked.
 *
 * Not a client component: it is pure CSS and SVG with no state or handlers, so
 * it renders on the server and the animation runs from the first paint rather
 * than waiting for hydration. That matters here — an animation that starts late
 * reads as a page still loading.
 *
 * Motion is handled by the global `prefers-reduced-motion` reset in
 * `globals.css`, which zeroes every animation. The tick's `stroke-dashoffset`
 * therefore has to rest at its *finished* value, so a reduced-motion visitor
 * sees a complete tick rather than an empty circle. Hence `pathLength={1}` with
 * the dash array set and the offset animated from 1 to 0.
 */
export function OrderConfirmedBadge({ tone = "success" }: { tone?: "success" | "neutral" }) {
  const palette =
    tone === "success"
      ? "bg-success-100 text-success-700 dark:bg-success-700/25 dark:text-success-100"
      : "bg-surface-sunken text-content";

  return (
    <span className="relative mx-auto grid size-16 place-items-center">
      {/*
        The expanding ring sits behind the disc and is purely decorative, so it
        is hidden from assistive technology along with everything else here —
        the heading beside it carries the meaning.
      */}
      <span
        aria-hidden
        className={`absolute inset-0 rounded-full ${
          tone === "success" ? "bg-success-100 dark:bg-success-700/25" : "bg-surface-sunken"
        }`}
        style={{ animation: "var(--animate-confirm-ring)" }}
      />

      <span
        aria-hidden
        className={`relative grid size-16 place-items-center rounded-full ${palette}`}
        style={{ animation: "var(--animate-confirm-disc)" }}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          className="size-7"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path
            d="M4.5 12.5 L9.5 17.5 L19.5 7"
            stroke="currentColor"
            pathLength={1}
            strokeDasharray={1}
            strokeDashoffset={0}
            style={{ animation: "var(--animate-confirm-tick)" }}
          />
        </svg>
      </span>
    </span>
  );
}
