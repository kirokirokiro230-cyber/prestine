import type { Metadata } from "next";
import { Compass } from "@phosphor-icons/react/dist/ssr";
import { ProductGrid } from "@/components/product/product-grid";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionHeading } from "@/components/ui/section-heading";
import { allCategories, bestSellers } from "@/lib/catalog";

export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false, follow: true },
};

/**
 * Do not add a root `app/loading.tsx`.
 *
 * A root loading file starts streaming the response before the page runs, which
 * commits a 200 status. `notFound()` then renders this page but cannot change the
 * status, so every missing product, category and collection becomes a soft 404
 * that search engines index (vercel/next.js#75543).
 *
 * There is nothing slow enough here to need a global skeleton — pages are
 * statically rendered. If a genuinely slow subtree appears later, wrap that
 * subtree in its own `<Suspense>` rather than reintroducing a root loading file,
 * and re-run `npm run smoke` to confirm 404s still return 404.
 */
export default async function NotFound() {
  const [categories, popular] = await Promise.all([allCategories(), bestSellers(4)]);

  return (
    <div className="page-gutter mx-auto max-w-page py-10">
      <EmptyState
        icon={<Compass size={24} aria-hidden />}
        title="We can’t find that page"
        description="The link may be old, or the piece may have sold through. Here is the way back."
      >
        <ButtonLink href="/" size="md">
          Back to home
        </ButtonLink>
        <ButtonLink href="/shop" variant="outline" size="md">
          Browse all clothing
        </ButtonLink>
      </EmptyState>

      <nav aria-label="Categories" className="mx-auto max-w-2xl">
        <p className="eyebrow mb-4 text-center">Or jump to a category</p>
        <ul className="flex flex-wrap justify-center gap-2">
          {categories.map((category) => (
            <li key={category.slug}>
              <ButtonLink href={`/shop/${category.slug}`} variant="secondary" size="sm">
                {category.name}
              </ButtonLink>
            </li>
          ))}
        </ul>
      </nav>

      <section className="mt-20">
        <SectionHeading
          eyebrow="Popular right now"
          title="Best sellers"
          align="center"
          className="mb-10"
        />
        <ProductGrid products={popular} columns={4} />
      </section>
    </div>
  );
}
