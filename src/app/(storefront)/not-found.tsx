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
 * No `loading.tsx` may sit above a route that can call `notFound()`.
 *
 * A loading file starts streaming the response before the page runs, which commits
 * a 200 status. `notFound()` then renders this page but cannot change the status, so
 * the route becomes a soft 404 that search engines index (vercel/next.js#75543).
 *
 * The subtlety that caused this twice: a `loading.tsx` covers its own segment *and
 * every segment nested under it*. A file at the `(storefront)` root therefore
 * applied to `/product/[slug]`, and `shop/loading.tsx` applied to
 * `/shop/[category]`, even though each had been written for the page beside it.
 * Deleting only the one inside `[slug]` does not help — the parent takes over.
 *
 * So the three pages that wanted a skeleton are parked in URL-transparent route
 * groups that contain nothing else:
 *
 *   (home)/            page.tsx + loading.tsx   serves "/"
 *   shop/(index)/      page.tsx + loading.tsx   serves "/shop"
 *   collections/(index)/                        serves "/collections"
 *
 * The group keeps each boundary from reaching a sibling, so `/shop` streams a
 * skeleton while `/shop/not-a-category` still answers 404.
 *
 * Before adding a `loading.tsx`, check whether any route below it calls
 * `notFound()`. If one does, put the page in its own group as above, or wrap the
 * slow subtree in its own `<Suspense>`. Then run `npm run smoke`, which asserts
 * that an unknown product URL returns 404 and will fail if this regresses.
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
