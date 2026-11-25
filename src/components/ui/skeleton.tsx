import { cn } from "@/lib/utils";

/**
 * Loading placeholders.
 *
 * Every skeleton on the site is built from `Skeleton` below — a single shimmering
 * bar — composed into shapes that match the real content's exact footprint. That
 * "exact footprint" part is the whole point: a skeleton that is the wrong aspect
 * ratio or the wrong line count reflows the page the instant real content arrives,
 * which reads as more jarring than showing nothing at all. Each composite here is
 * commented with which real component it stands in for, so the two stay in sync.
 *
 * Marked `aria-hidden` throughout — a loading region announces itself once, via
 * `role="status"` on the container that uses these, not once per bar.
 */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("animate-shimmer bg-surface-sunken", className)} />;
}

/** Matches the footprint of a ProductCard (`product-card.tsx`) so grids never
 *  shift when real cards replace them: same image aspect ratio, same three text
 *  rows in the same order (name+price, tagline, swatches+rating). */
export function ProductCardSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      <Skeleton className="aspect-3/4 w-full" />
      <div className="mt-0.5 flex flex-col gap-2">
        <div className="flex items-start justify-between gap-3">
          <Skeleton className="h-4 w-3/5" />
          <Skeleton className="h-4 w-10 shrink-0" />
        </div>
        <Skeleton className="h-3 w-2/5" />
        <div className="mt-1 flex items-center justify-between gap-3">
          <Skeleton className="h-3.5 w-14" />
          <Skeleton className="h-3 w-10" />
        </div>
      </div>
    </div>
  );
}

const GRID_COLUMN_CLASSES: Record<2 | 3 | 4, string> = {
  2: "grid-cols-1 sm:grid-cols-2",
  3: "grid-cols-2 lg:grid-cols-3",
  4: "grid-cols-2 lg:grid-cols-3 xl:grid-cols-4",
};

/** Mirrors `ProductGrid`'s own column classes (`product-grid.tsx`) via the same
 *  `columns` prop, so a grid and its skeleton always agree on layout. */
export function ProductGridSkeleton({
  count = 8,
  columns = 4,
  className,
}: {
  count?: number;
  columns?: 2 | 3 | 4;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid gap-x-4 gap-y-10 sm:gap-y-12 lg:gap-x-6",
        GRID_COLUMN_CLASSES[columns],
        className,
      )}
    >
      {Array.from({ length: count }, (_, i) => (
        <ProductCardSkeleton key={i} />
      ))}
    </div>
  );
}

/** A page's `<h1>` plus its one-line description, e.g. every static/editorial page
 *  and the top of a listing page before the filter rail. */
export function PageHeaderSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <Skeleton className="h-9 w-64" />
      <Skeleton className="h-4 w-full max-w-md" />
    </div>
  );
}

/** A stack of full-width bars of a given height — the generic shape behind
 *  order-history rows, address cards, and any other "list of similar-sized
 *  blocks" content that does not need a more specific skeleton of its own. */
export function BlockListSkeleton({
  count = 2,
  blockClassName = "h-32",
  className,
}: {
  count?: number;
  blockClassName?: string;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-4", className)}>
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} className={cn("w-full", blockClassName)} />
      ))}
    </div>
  );
}

/** A handful of text-line bars of decreasing/varied width — paragraphs, form
 *  fields stacked vertically, anything read top to bottom as prose or a form. */
export function LineSkeleton({
  lines = 3,
  className,
}: {
  lines?: number;
  className?: string;
}) {
  const widths = ["w-full", "w-11/12", "w-4/5", "w-3/5"];
  return (
    <div className={cn("flex flex-col gap-2.5", className)}>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className={cn("h-4", widths[i % widths.length])} />
      ))}
    </div>
  );
}

/**
 * Mirrors the product detail page's above-the-fold layout (`product/[slug]/page.tsx`):
 * breadcrumb row, then a gallery (large image + thumbnail rail) beside a purchase
 * panel (name, price, swatches, size grid, CTA), then the detail-tabs bar.
 */
export function ProductDetailSkeleton() {
  return (
    <div className="page-gutter mx-auto max-w-page py-6 lg:py-10">
      <Skeleton className="mb-6 h-4 w-72" />

      <div className="grid gap-10 lg:grid-cols-[1.1fr_1fr] lg:gap-16">
        {/* Gallery */}
        <div className="flex flex-col gap-3">
          <Skeleton className="aspect-3/4 w-full" />
          <div className="flex gap-2.5">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="aspect-3/4 w-16 shrink-0 sm:w-20" />
            ))}
          </div>
        </div>

        {/* Purchase panel */}
        <div className="flex flex-col gap-5 lg:sticky lg:top-28 lg:self-start">
          <div className="flex flex-col gap-2.5">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-8 w-4/5" />
            <Skeleton className="h-5 w-24" />
          </div>

          <div className="flex items-center gap-2 border-t border-line pt-5">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="size-8 rounded-full" />
            ))}
          </div>

          <div className="flex flex-col gap-2.5">
            <Skeleton className="h-3 w-16" />
            <div className="grid grid-cols-4 gap-2">
              {Array.from({ length: 8 }, (_, i) => (
                <Skeleton key={i} className="h-11" />
              ))}
            </div>
          </div>

          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      </div>

      {/* Detail tabs */}
      <div className="mt-16 max-w-3xl lg:mt-24">
        <div className="flex gap-6 border-b border-line pb-3">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-4 w-20" />
          ))}
        </div>
        <LineSkeleton lines={3} className="mt-6" />
      </div>
    </div>
  );
}

/**
 * Mirrors the home page's hero + rail structure: full-bleed banner, a strip of
 * category tiles, then a product rail. Deliberately approximate below the fold —
 * matching every editorial section exactly would make this file track the home
 * page's content instead of its shape.
 */
export function HomeSkeleton() {
  return (
    <div>
      <Skeleton className="aspect-4/5 w-full sm:aspect-16/9 lg:aspect-21/9" />

      <div className="page-gutter mx-auto max-w-page py-16 lg:py-20">
        <PageHeaderSkeleton className="mb-10" />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-8">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="aspect-square" />
          ))}
        </div>
      </div>

      <div className="page-gutter mx-auto max-w-page pb-16 lg:pb-20">
        <PageHeaderSkeleton className="mb-10" />
        <div className="flex gap-4 overflow-hidden lg:gap-6">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="w-[62vw] shrink-0 sm:w-[38vw] lg:w-[27vw] xl:w-[21vw]">
              <ProductCardSkeleton />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * A shop/collection/search listing: page header, filter rail beside a product
 * grid. Mirrors `ProductListing`'s `lg:grid-cols-[16rem_1fr]` split.
 */
export function ProductListingSkeleton({ columns = 3 }: { columns?: 2 | 3 | 4 }) {
  return (
    <div className="page-gutter mx-auto max-w-page py-8 lg:py-10">
      <Skeleton className="mb-6 h-4 w-56" />
      <PageHeaderSkeleton className="mb-8" />

      <div className="grid gap-10 lg:grid-cols-[16rem_1fr]">
        <div className="hidden flex-col gap-6 lg:flex">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="flex flex-col gap-3">
              <Skeleton className="h-3 w-20" />
              <div className="flex flex-col gap-2">
                {Array.from({ length: 4 }, (_, j) => (
                  <Skeleton key={j} className="h-4 w-full" />
                ))}
              </div>
            </div>
          ))}
        </div>

        <div>
          <div className="mb-6 flex items-center justify-between gap-4">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-9 w-36" />
          </div>
          <ProductGridSkeleton count={12} columns={columns} />
        </div>
      </div>
    </div>
  );
}

/**
 * Admin dashboard-style stat row — matches `StatCard` (`admin/primitives.tsx`):
 * an uppercase label, a large number, and a small change/hint line.
 */
export function AdminStatCardsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="border border-line bg-surface p-5">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="mt-3 h-8 w-16" />
          <Skeleton className="mt-3 h-3 w-24" />
        </div>
      ))}
    </div>
  );
}

/**
 * Admin list page — matches the `Panel` + `<table>` shell every admin list route
 * shares (`admin/products/page.tsx`, `admin/orders/page.tsx`, and the rest):
 * a header bar, then N rows of column-shaped bars.
 */
export function AdminTableSkeleton({
  rows = 8,
  columns = 5,
}: {
  rows?: number;
  columns?: number;
}) {
  return (
    <div className="border border-line bg-surface">
      <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-4 w-48" />
      </div>

      <div className="px-5 py-2">
        {/* Column header row */}
        <div className="flex gap-4 border-b border-line py-3">
          {Array.from({ length: columns }, (_, i) => (
            <Skeleton key={i} className={cn("h-3", i === 0 ? "w-24" : "flex-1")} />
          ))}
        </div>

        {Array.from({ length: rows }, (_, row) => (
          <div key={row} className="flex gap-4 border-b border-line py-4 last:border-0">
            {Array.from({ length: columns }, (_, col) => (
              <Skeleton key={col} className={cn("h-4", col === 0 ? "w-24" : "flex-1")} />
            ))}
          </div>
        ))}
      </div>

      <div className="border-t border-line px-5 py-3">
        <Skeleton className="h-3 w-40" />
      </div>
    </div>
  );
}

/** Full admin list page: header + optional stat row + table. Compose the two
 *  pieces above directly (as `admin/orders/loading.tsx` does) when a page needs
 *  the stat row; use this when it does not (most admin list pages). */
export function AdminListPageSkeleton({
  rows = 8,
  columns = 5,
}: {
  rows?: number;
  columns?: number;
}) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-4 w-28" />
        </div>
        <Skeleton className="h-11 w-36" />
      </div>
      <AdminTableSkeleton rows={rows} columns={columns} />
    </div>
  );
}

/**
 * The cart page (`cart-view.tsx`'s hydration gate, and its route's `loading.tsx`)
 * — a title bar, two line-item rows, and the order-summary block, matching that
 * page's `lg:grid-cols-[1fr_22rem]` split.
 */
export function CartSkeleton() {
  return (
    <div className="page-gutter mx-auto max-w-page py-10">
      <Skeleton className="h-9 w-48" />
      <div className="mt-10 grid gap-10 lg:grid-cols-[1fr_22rem]">
        <div className="flex flex-col gap-6">
          {Array.from({ length: 2 }, (_, i) => (
            <div key={i} className="flex gap-6">
              <Skeleton className="aspect-3/4 w-32" />
              <div className="flex flex-1 flex-col gap-3 pt-2">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-1/3" />
              </div>
            </div>
          ))}
        </div>
        <Skeleton className="h-64" />
      </div>
    </div>
  );
}

/**
 * Checkout page while the cart store hydrates from localStorage
 * (`checkout-flow.tsx`) — the contact/delivery form on the left, the sticky order
 * summary on the right, matching that page's `lg:grid-cols-[1fr_22rem]` split.
 */
export function CheckoutSkeleton() {
  return (
    <div className="page-gutter mx-auto max-w-page py-8 lg:py-12">
      <div className="flex items-center justify-between gap-4">
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-4 w-24" />
      </div>

      <div className="mt-10 grid items-start gap-10 lg:grid-cols-[1fr_22rem] lg:gap-16">
        <div className="flex flex-col gap-5">
          <Skeleton className="h-7 w-56" />
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
          <Skeleton className="mt-2 h-14 w-full" />
        </div>
        <Skeleton className="h-80 w-full" />
      </div>
    </div>
  );
}

/**
 * Order-confirmation page while it reads the order back from the server
 * (`confirmation-view.tsx` and its page-level `<Suspense>` fallback) — a
 * centred success block, three "what happens next" tiles, then an order-lines
 * panel, mirroring that page's actual sections.
 */
export function ConfirmationSkeleton() {
  return (
    <div className="page-gutter mx-auto max-w-page py-12 lg:py-16" role="status" aria-label="Confirming your order">
      <div className="mx-auto flex max-w-2xl flex-col items-center gap-4 text-center">
        <Skeleton className="size-14 rounded-full" />
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-4 w-full max-w-md" />
        <Skeleton className="h-4 w-3/4 max-w-md" />
      </div>

      <div className="mx-auto mt-10 grid max-w-3xl gap-6 sm:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>

      <div className="mx-auto mt-14 max-w-3xl">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="mt-4 h-48 w-full" />
      </div>
    </div>
  );
}

/**
 * Account section pages (`/account`, `/account/orders`, etc.) — mirrors
 * `AccountShell`'s own chrome (breadcrumb, heading, side nav) since that shell is
 * a client component rendered inside each page rather than a layout, so
 * `loading.tsx` cannot reuse it directly and needs its own approximation.
 */
export function AccountPageSkeleton({
  children,
}: {
  /** The page-specific body, slotted where `AccountShell`'s children would go. */
  children?: React.ReactNode;
}) {
  return (
    <div className="page-gutter mx-auto max-w-page py-8 lg:py-12">
      <Skeleton className="mb-6 h-4 w-48" />
      <div className="max-w-2xl">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="mt-3 h-10 w-48" />
        <Skeleton className="mt-4 h-4 w-full" />
      </div>

      <div className="mt-10 grid min-w-0 gap-10 lg:grid-cols-[14rem_1fr] lg:gap-16">
        <div className="flex gap-3 lg:flex-col lg:gap-2">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-9 w-24 lg:w-full" />
          ))}
        </div>
        <div className="min-w-0">{children ?? <BlockListSkeleton count={2} />}</div>
      </div>
    </div>
  );
}

/**
 * Editorial/support/legal pages built on `ContentPage` (`layout/content-page.tsx`)
 * that fetch settings before rendering — faq, terms, the policy pages,
 * maintenance. Breadcrumb, heading block, then a capped-width prose column.
 */
export function EditorialPageSkeleton() {
  return (
    <div className="page-gutter mx-auto max-w-page py-8 lg:py-12">
      <Skeleton className="mb-6 h-4 w-40" />
      <div className="max-w-3xl">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="mt-3 h-10 w-full max-w-xl" />
        <Skeleton className="mt-5 h-4 w-full max-w-lg" />
      </div>
      <div className="mt-12 max-w-2xl">
        <LineSkeleton lines={6} />
      </div>
    </div>
  );
}

/** The `/collections` index — a grid of large image tiles, one per collection
 *  (`app/(storefront)/collections/page.tsx`), distinct from a single collection's
 *  own product listing at `/collections/[slug]`. */
export function CollectionsIndexSkeleton() {
  return (
    <div className="page-gutter mx-auto max-w-page py-8 lg:py-12">
      <Skeleton className="mb-6 h-4 w-40" />
      <PageHeaderSkeleton className="max-w-2xl" />
      <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:gap-6">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="aspect-16/11 w-full" />
        ))}
      </div>
    </div>
  );
}

/**
 * Sign in / create account / reset password — all three share the same centred
 * card layout (logo, heading, a short form, a return-to-store link).
 */
export function AuthPageSkeleton() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-canvas px-5 py-16">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <Skeleton className="h-6 w-40" />
        </div>
        <div className="border border-line bg-surface p-6">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="mt-2 h-3 w-56" />
          <div className="mt-6 flex flex-col gap-4">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
            <Skeleton className="mt-2 h-11 w-full" />
          </div>
        </div>
        <div className="mt-6 flex justify-center">
          <Skeleton className="h-3 w-32" />
        </div>
      </div>
    </div>
  );
}

/** A single admin record page (an order or a customer detail view): a header,
 *  then two stacked panels. Approximate on purpose — detail pages vary more than
 *  list pages, and this is meant to hold the shape of "a page is loading" rather
 *  than every field. */
export function AdminDetailPageSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-9 w-28" />
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="flex flex-col gap-4">
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
        <div className="flex flex-col gap-4">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      </div>
    </div>
  );
}

/** The admin dashboard (`admin/page.tsx`): header, three stat cards, a revenue
 *  chart panel, two side-by-side bar-list panels, then a recent-orders table
 *  beside a fulfilment tile grid. */
export function AdminDashboardSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="h-9 w-52" />
      </div>

      <AdminStatCardsSkeleton count={3} />

      <div className="border border-line bg-surface p-5">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="mt-4 h-56 w-full" />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        {Array.from({ length: 2 }, (_, i) => (
          <div key={i} className="border border-line bg-surface p-5">
            <Skeleton className="h-3 w-28" />
            <div className="mt-4 flex flex-col gap-3">
              {Array.from({ length: 4 }, (_, j) => (
                <Skeleton key={j} className="h-4 w-full" />
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <AdminTableSkeleton rows={6} columns={4} />
        <div className="border border-line bg-surface p-5">
          <Skeleton className="h-3 w-20" />
          <div className="mt-4 grid grid-cols-2 gap-4">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/** A product create/edit form (`admin/product-form.tsx`) — several field-shaped
 *  bars grouped into panels, plus an image-upload block. Approximate: the real
 *  form has many more fields than any skeleton should attempt to enumerate. */
export function AdminFormPageSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-40" />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="flex flex-col gap-4">
          <div className="border border-line bg-surface p-5">
            <Skeleton className="h-3 w-24" />
            <div className="mt-4 flex flex-col gap-4">
              {Array.from({ length: 4 }, (_, i) => (
                <Skeleton key={i} className="h-11 w-full" />
              ))}
            </div>
          </div>
          <div className="border border-line bg-surface p-5">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="mt-4 h-32 w-full" />
          </div>
        </div>
        <div className="flex flex-col gap-4">
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      </div>
    </div>
  );
}
