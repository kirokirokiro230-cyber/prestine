import type { Metadata } from "next";
import { Compass } from "@phosphor-icons/react/dist/ssr";
import { Logo } from "@/components/layout/logo";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { storeSettings } from "@/lib/catalog";

export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false, follow: true },
};

/**
 * Root 404, for URLs that match no route at all — including anything under
 * `/admin` that does not exist.
 *
 * Deliberately self-contained. It renders inside the root layout, which has no
 * header, footer or cart drawer, so there is nothing here that depends on the
 * storefront providers. Shop 404s — a missing product, category or collection —
 * get the richer `(storefront)/not-found.tsx` with full navigation and a
 * best-sellers rail instead.
 *
 * Do not add a root `app/loading.tsx`. A root loading file starts streaming the
 * response before the page runs, which commits a 200 status. `notFound()` then
 * renders a 404 page that cannot change the status, so every missing product
 * becomes a soft 404 that search engines index (vercel/next.js#75543). Wrap a slow
 * subtree in its own `<Suspense>` instead, and re-run `npm run smoke` to confirm
 * 404s still return 404.
 */
export default async function NotFound() {
  const settings = await storeSettings();

  return (
    <main className="page-gutter mx-auto flex min-h-dvh max-w-page flex-col items-center justify-center py-16">
      {/* Logo renders its own link to home. */}
      <Logo name={settings.name} className="mb-12" />

      <EmptyState
        icon={<Compass size={24} aria-hidden />}
        title="We can’t find that page"
        description="The link may be old, or the address may have a typo in it."
      >
        <ButtonLink href="/" size="md">
          Back to home
        </ButtonLink>
        <ButtonLink href="/shop" variant="outline" size="md">
          Browse all clothing
        </ButtonLink>
      </EmptyState>
    </main>
  );
}
