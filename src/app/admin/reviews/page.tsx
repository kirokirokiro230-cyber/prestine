import type { Metadata } from "next";
import Link from "next/link";
import { EyeSlash, Eye } from "@phosphor-icons/react/dist/ssr";
import { toggleReviewAction } from "@/app/admin/actions/catalog";
import { Panel, StatCard } from "@/components/admin/primitives";
import { Rating } from "@/components/ui/rating";
import { buildReviews } from "@/lib/data/reviews";
import { submittedToDisplayReview } from "@/lib/review-reasons";
import { formatDate } from "@/lib/format";
import type { Review } from "@/lib/types";
import { listProducts } from "@/server/repositories/products";
import { listAllSubmittedReviews } from "@/server/repositories/reviews";
import { listHiddenReviewIds } from "@/server/repositories/settings";
import { requirePermission } from "@/server/session";

export const metadata: Metadata = { title: "Reviews" };

const PER_PAGE = 25;

export default async function ReviewsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; rating?: string; state?: string; product?: string }>;
}) {
  await requirePermission("products:write");

  const [params, products, hiddenIds, submitted] = await Promise.all([
    searchParams,
    listProducts(),
    listHiddenReviewIds(),
    listAllSubmittedReviews(),
  ]);

  const hidden = new Set(hiddenIds);
  const nameBySlug = new Map(products.map((product) => [product.slug, product.name]));

  /**
   * Two sources merged into one list. The seeded editorial reviews are generated per
   * product from its slug; the real ones are stored. Both are moderated the same way —
   * hide by id — so the panel shows them together, real reviews first so a moderator sees
   * genuine feedback before the editorial filler.
   */
  const generated: Array<Review & { productSlug: string; productName: string }> =
    products.flatMap((product) =>
      buildReviews(
        product.slug,
        product.reviewCount,
        product.sizes.map((size) => size.label),
      ).map((review) => ({
        ...review,
        productSlug: product.slug,
        productName: product.name,
      })),
    );

  const submittedRows: Array<Review & { productSlug: string; productName: string }> =
    submitted.map((review) => ({
      ...submittedToDisplayReview(review),
      productSlug: review.productSlug,
      productName: nameBySlug.get(review.productSlug) ?? review.productSlug,
    }));

  const all = [...submittedRows, ...generated];

  const ratingFilter = Number(params.rating);
  const filtered = all.filter((review) => {
    if (params.product && review.productSlug !== params.product) return false;
    if ([1, 2, 3, 4, 5].includes(ratingFilter) && review.rating !== ratingFilter) return false;
    if (params.state === "hidden" && !hidden.has(review.id)) return false;
    if (params.state === "visible" && hidden.has(review.id)) return false;
    return true;
  });

  const sorted = filtered.sort((a, b) => (a.date < b.date ? 1 : -1));

  const page = Math.max(1, Number(params.page ?? 1) || 1);
  const totalPages = Math.max(1, Math.ceil(sorted.length / PER_PAGE));
  const safePage = Math.min(page, totalPages);
  const rows = sorted.slice((safePage - 1) * PER_PAGE, safePage * PER_PAGE);

  const average =
    all.length === 0
      ? 0
      : Math.round((all.reduce((sum, review) => sum + review.rating, 0) / all.length) * 10) / 10;
  const critical = all.filter((review) => review.rating <= 3).length;

  const query = (updates: Record<string, string | undefined>) => {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries({ ...params, ...updates })) {
      if (value) next.set(key, value);
    }
    return `/admin/reviews?${next.toString()}`;
  };

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="font-display text-3xl leading-tight">Reviews</h1>
        <p className="mt-1.5 max-w-2xl text-sm text-content-muted">
          Hiding a review removes it from the storefront and from the product&apos;s rating
          histogram. Use it for abuse or a mistaken submission — not for a low score you
          would rather not show.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total reviews" value={String(all.length)} />
        <StatCard label="Average rating" value={average.toFixed(1)} hint="Across all products" />
        <StatCard label="Three stars or fewer" value={String(critical)} hint="Worth reading" />
        <StatCard label="Hidden" value={String(hidden.size)} />
      </div>

      <Panel
        title="All reviews"
        description={`${sorted.length} matching, newest first.`}
        bodyClassName="px-0 py-0"
      >
        {/* Filters as links — no client JS needed for this screen */}
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-5 py-3 text-xs">
          <span className="text-content-muted">Rating</span>
          <FilterLink href={query({ rating: undefined, page: undefined })} active={!params.rating}>
            Any
          </FilterLink>
          {[5, 4, 3, 2, 1].map((stars) => (
            <FilterLink
              key={stars}
              href={query({ rating: String(stars), page: undefined })}
              active={ratingFilter === stars}
            >
              {stars}★
            </FilterLink>
          ))}

          <span className="ml-4 text-content-muted">State</span>
          <FilterLink href={query({ state: undefined, page: undefined })} active={!params.state}>
            All
          </FilterLink>
          <FilterLink
            href={query({ state: "visible", page: undefined })}
            active={params.state === "visible"}
          >
            Visible
          </FilterLink>
          <FilterLink
            href={query({ state: "hidden", page: undefined })}
            active={params.state === "hidden"}
          >
            Hidden
          </FilterLink>

          {params.product ? (
            <FilterLink href={query({ product: undefined, page: undefined })} active>
              {params.product} ✕
            </FilterLink>
          ) : null}
        </div>

        {rows.length === 0 ? (
          <p className="px-5 py-16 text-center text-sm text-content-muted">
            No reviews match those filters.
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {rows.map((review) => {
              const isHidden = hidden.has(review.id);

              return (
                <li
                  key={review.id}
                  className={isHidden ? "bg-surface-sunken/60 px-5 py-4" : "px-5 py-4"}
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-3">
                        <Rating value={review.rating} size={12} hideCount />
                        <h3 className="text-sm font-medium">{review.title}</h3>
                        {isHidden ? (
                          <span className="bg-danger-100 px-2 py-0.5 text-2xs uppercase tracking-[0.08em] text-danger-700 dark:bg-danger-700/25 dark:text-danger-100">
                            Hidden
                          </span>
                        ) : null}
                      </div>

                      <p className="mt-2 text-sm leading-relaxed text-content-muted">
                        {review.body}
                      </p>

                      <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-content-subtle">
                        <span>{review.author}</span>
                        <span>{formatDate(review.date, "short")}</span>
                        {review.verified ? <span>Verified purchase</span> : null}
                        {review.sizePurchased ? <span>Size {review.sizePurchased}</span> : null}
                        <Link
                          href={query({ product: review.productSlug, page: undefined })}
                          className="link-underline text-content-muted"
                        >
                          {review.productName}
                        </Link>
                      </p>
                    </div>

                    <form action={toggleReviewAction} className="shrink-0">
                      <input type="hidden" name="id" value={review.id} />
                      <input type="hidden" name="hidden" value={isHidden ? "0" : "1"} />
                      <button
                        type="submit"
                        className="inline-flex items-center gap-1.5 border border-line px-3 py-2 text-xs text-content-muted transition-colors hover:border-line-strong hover:text-content"
                      >
                        {isHidden ? (
                          <>
                            <Eye size={13} aria-hidden />
                            Restore
                          </>
                        ) : (
                          <>
                            <EyeSlash size={13} aria-hidden />
                            Hide
                          </>
                        )}
                      </button>
                    </form>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {totalPages > 1 ? (
          <div className="flex items-center justify-between gap-4 border-t border-line px-5 py-3 text-xs text-content-muted">
            <p data-numeric>
              Page {safePage} of {totalPages}
            </p>
            <div className="flex items-center gap-3">
              {safePage > 1 ? (
                <Link href={query({ page: String(safePage - 1) })} className="link-underline">
                  Previous
                </Link>
              ) : null}
              {safePage < totalPages ? (
                <Link href={query({ page: String(safePage + 1) })} className="link-underline">
                  Next
                </Link>
              ) : null}
            </div>
          </div>
        ) : null}
      </Panel>
    </div>
  );
}

function FilterLink({
  href,
  active,
  children,
}: {
  href: string;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={
        active
          ? "border border-line-strong bg-inverse px-2.5 py-1.5 text-on-inverse"
          : "border border-line px-2.5 py-1.5 text-content-muted transition-colors hover:border-line-strong hover:text-content"
      }
    >
      {children}
    </Link>
  );
}
