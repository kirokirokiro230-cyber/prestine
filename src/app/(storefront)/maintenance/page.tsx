import type { Metadata } from "next";
import { Clock, Envelope } from "@phosphor-icons/react/dist/ssr";
import { Logo } from "@/components/layout/logo";
import { storeSettings } from "@/lib/catalog";

export const metadata: Metadata = {
  title: "Back shortly",
  // Never index this in place of the real page.
  robots: { index: false, follow: false },
};

/**
 * Shown while `maintenanceMode` is on.
 *
 * Reached by rewrite from middleware, so the shopper keeps the URL they asked for
 * and lands on it once the shop reopens. Signed-in staff bypass this entirely,
 * which is the point of the flag — reprice or restock with the shop closed and
 * still check the result on the live site.
 *
 * Deliberately self-contained: no navigation, no cart, nothing that would invite a
 * click into a store that is not serving. It renders inside the root layout, so the
 * header and footer are still present — that is intentional, it keeps the page
 * recognisably the brand rather than a bare error screen.
 */
export default async function MaintenancePage() {
  const settings = await storeSettings();

  return (
    <div className="page-gutter mx-auto flex max-w-page flex-col items-center py-24 text-center lg:py-32">
      <Logo name={settings.name} className="mb-12" />

      <span
        aria-hidden
        className="grid size-14 place-items-center rounded-full bg-surface-sunken text-content-muted"
      >
        <Clock size={24} />
      </span>

      <h1 className="mt-8 max-w-xl text-4xl leading-[1.05] sm:text-5xl">
        We are making a few changes.
      </h1>

      <p className="mt-5 max-w-md text-sm leading-relaxed text-content-muted sm:text-base">
        The shop is closed for a short while as we update the range. Everything will be
        back shortly — existing orders are unaffected and still on their way.
      </p>

      <div className="mt-10 flex flex-col items-center gap-3 border-t border-line pt-8">
        <p className="eyebrow">Need something now?</p>
        <a
          href={`mailto:${settings.email}`}
          className="inline-flex items-center gap-2 text-sm text-content"
        >
          <Envelope size={16} aria-hidden />
          <span className="link-underline">{settings.email}</span>
        </a>
        <p data-numeric className="text-xs text-content-subtle">
          {settings.phone}
        </p>
      </div>
    </div>
  );
}
