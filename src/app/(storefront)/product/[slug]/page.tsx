import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProductGallery } from "@/components/product/product-gallery";
import { ProductGrid } from "@/components/product/product-grid";
import { PurchasePanel } from "@/components/product/purchase-panel";
import { RecentlyViewed } from "@/components/product/recently-viewed";
import { ReviewsSection } from "@/components/product/reviews-section";
import { ViewTracker } from "@/components/product/view-tracker";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { SectionHeading } from "@/components/ui/section-heading";
import { Tabs } from "@/components/ui/tabs";
import {
  getCategory,
  getProductBySlug,
  getProductReviews,
  relatedProducts,
  storeSettings,
  toSummary,
} from "@/lib/catalog";
import { createMoneyFormatter } from "@/lib/format";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const [product, settings] = await Promise.all([getProductBySlug(slug), storeSettings()]);

  // Bail out here rather than in the page component: metadata resolves first, so
  // returning a title for a missing product commits a 200 response and the
  // not-found page is served as a soft 404.
  if (!product) notFound();

  const money = createMoneyFormatter(settings.currency, settings.locale);
  const description =
    product.seoDescription ??
    `${product.tagline} ${product.composition} ${money(product.price)}.`;

  return {
    title: product.seoTitle ?? product.name,
    description,
    alternates: { canonical: `/product/${product.slug}` },
    openGraph: {
      type: "website",
      title: `${product.name} · ${settings.name}`,
      description,
      url: `${settings.url}/product/${product.slug}`,
    },
  };
}

export default async function ProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);

  const product = await getProductBySlug(slug);
  if (!product) notFound();

  const requestedColor = Array.isArray(query.color) ? query.color[0] : query.color;
  const color = product.colors.find((c) => c.id === requestedColor) ?? product.colors[0];

  const [category, related, reviews, settings] = await Promise.all([
    getCategory(product.category),
    relatedProducts(product, 4),
    getProductReviews(product),
    storeSettings(),
  ]);

  const summary = toSummary(product);

  // Rating recomputed from the visible reviews, so hiding one in admin moves the
  // stars on the page rather than leaving a figure nothing supports.
  const rating =
    reviews.length === 0
      ? 0
      : Math.round((reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length) * 10) /
        10;

  /**
   * Product structured data. Gives search engines price, availability and the
   * aggregate rating, which is what produces rich results for retail listings.
   */
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: product.tagline,
    sku: product.sku ?? product.id,
    category: category?.name,
    material: product.composition,
    brand: { "@type": "Brand", name: settings.name },
    ...(reviews.length > 0
      ? {
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: rating,
            reviewCount: reviews.length,
            bestRating: 5,
            worstRating: 1,
          },
        }
      : {}),
    offers: {
      "@type": "Offer",
      url: `${settings.url}/product/${product.slug}`,
      priceCurrency: settings.currency,
      price: (product.price / 100).toFixed(2),
      /**
       * Always in stock, and truthfully so: the shop does not track inventory, so
       * nothing is ever unavailable. Search engines treat this field as a promise —
       * if that ever changes, this has to change with it.
       */
      availability: "https://schema.org/InStock",
      itemCondition: "https://schema.org/NewCondition",
    },
    review: reviews.slice(0, 5).map((review) => ({
      "@type": "Review",
      reviewRating: { "@type": "Rating", ratingValue: review.rating, bestRating: 5 },
      author: { "@type": "Person", name: review.author },
      datePublished: review.date,
      name: review.title,
      reviewBody: review.body,
    })),
  };

  return (
    <>
      <script
        type="application/ld+json"
        // Serialised product data only — no user input reaches this string.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <ViewTracker slug={product.slug} />

      <div className="page-gutter mx-auto max-w-page py-6 lg:py-10">
        <Breadcrumbs
          items={[
            { label: "Home", href: "/" },
            { label: "All clothing", href: "/shop" },
            { label: category?.name ?? "Category", href: `/shop/${product.category}` },
            { label: product.name },
          ]}
          className="mb-6"
        />

        <div className="grid gap-10 lg:grid-cols-[1.1fr_1fr] lg:gap-16">
          <ProductGallery product={summary} color={color} />

          <div className="lg:sticky lg:top-28 lg:self-start">
            <PurchasePanel
              product={summary}
              fitNote={product.fitNote}
              initialColorId={color.id}
              deliveryDays={{
                min: settings.deliveryDaysMin,
                max: settings.deliveryDaysMax,
              }}
              settings={{
                currency: settings.currency,
                locale: settings.locale,
                email: settings.email,
                freeShippingThreshold: settings.freeShippingThreshold,
                returnWindowDays: settings.returnWindowDays,
                servicePromises: settings.servicePromises,
              }}
            />
          </div>
        </div>

        {/* Detail tabs */}
        <div className="mt-16 max-w-3xl lg:mt-24">
          <Tabs
            items={[
              {
                id: "description",
                label: "Description",
                content: (
                  <div className="flex flex-col gap-4 text-sm leading-relaxed text-content-muted sm:text-base">
                    {product.description.split("\n\n").map((paragraph) => (
                      <p key={paragraph.slice(0, 32)}>{paragraph}</p>
                    ))}
                    {product.origin ? (
                      <p className="pt-2 text-xs text-content-subtle">{product.origin}</p>
                    ) : null}
                  </div>
                ),
              },
              {
                id: "details",
                label: "Details & fit",
                content: (
                  <div className="flex flex-col gap-8">
                    {product.details.length > 0 ? (
                      <div>
                        <h3 className="eyebrow mb-4">Construction</h3>
                        <ul className="flex flex-col gap-2.5">
                          {product.details.map((detail) => (
                            <li
                              key={detail}
                              className="flex gap-3 text-sm leading-relaxed text-content-muted"
                            >
                              <span
                                aria-hidden
                                className="mt-2 size-1 shrink-0 rounded-full bg-accent"
                              />
                              {detail}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}

                    <dl className="grid gap-6 border-t border-line pt-6 sm:grid-cols-2">
                      <div>
                        <dt className="eyebrow mb-2">Composition</dt>
                        <dd className="text-sm text-content-muted">{product.composition}</dd>
                      </div>
                      <div>
                        <dt className="eyebrow mb-2">Fit</dt>
                        <dd className="text-sm text-content-muted">{product.fitNote}</dd>
                      </div>
                    </dl>
                  </div>
                ),
              },
              {
                id: "care",
                label: "Care",
                content: (
                  <div>
                    <ul className="flex flex-col gap-2.5">
                      {product.care.map((instruction) => (
                        <li
                          key={instruction}
                          className="flex gap-3 text-sm leading-relaxed text-content-muted"
                        >
                          <span
                            aria-hidden
                            className="mt-2 size-1 shrink-0 rounded-full bg-accent"
                          />
                          {instruction}
                        </li>
                      ))}
                    </ul>
                    <p className="mt-6 text-sm leading-relaxed text-content-muted">
                      Every piece we make carries free repairs for as long as you own it. If
                      something goes wrong — a seam, a button, a moth — send it back and we
                      will put it right.
                    </p>
                  </div>
                ),
              },
              {
                id: "shipping",
                label: "Shipping & returns",
                /*
                 * Merchant-managed in Settings → Service promises. Each line becomes a
                 * paragraph. The last one renders smaller and quieter, which is where
                 * the final-sale caveat used to be hardcoded — a merchant who does not
                 * want a caveat simply removes the line.
                 */
                content: (
                  <div className="flex flex-col gap-4 text-sm leading-relaxed text-content-muted">
                    {settings.shippingReturnsCopy.map((paragraph, index) => (
                      <p
                        key={paragraph}
                        className={
                          index === settings.shippingReturnsCopy.length - 1 &&
                          settings.shippingReturnsCopy.length > 1
                            ? "text-xs text-content-subtle"
                            : undefined
                        }
                      >
                        {paragraph}
                      </p>
                    ))}
                  </div>
                ),
              },
            ]}
          />
        </div>
      </div>

      {/* Cross-sell */}
      {related.length > 0 ? (
        <section className="page-gutter mx-auto max-w-page py-16">
          <SectionHeading
            eyebrow="Styled with"
            title="Pairs well with"
            description="Pieces our clients most often buy alongside this one."
            className="mb-10"
          />
          <ProductGrid products={related} columns={4} />
        </section>
      ) : null}

      {/* Reviews */}
      {reviews.length > 0 ? (
        <div className="border-t border-line">
          <div className="page-gutter mx-auto max-w-page py-16 lg:py-20">
            <ReviewsSection reviews={reviews} rating={rating} />
          </div>
        </div>
      ) : null}

      <RecentlyViewed excludeSlug={product.slug} />
    </>
  );
}
