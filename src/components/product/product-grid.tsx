import { toSummary } from "@/lib/product-utils";
import type { Product, ProductSummary } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ProductCard } from "./product-card";
import { RailScroller } from "./rail-scroller";

/**
 * Grids accept full product records but hand `<ProductCard>` a summary.
 *
 * This is the single boundary where the projection happens: these components run
 * on the server, so narrowing here keeps descriptions, care notes and review prose
 * out of the payload for every card on screen. Callers can also pass summaries
 * directly, which is what the client-side saved-items and recently-viewed views do.
 */
type GridProduct = Product | ProductSummary;

const asSummary = (product: GridProduct): ProductSummary =>
  "description" in product ? toSummary(product as Product) : (product as ProductSummary);

interface ProductGridProps {
  products: GridProduct[];
  /** Columns at the largest breakpoint. */
  columns?: 2 | 3 | 4;
  /** Eager-load the first N images. */
  priorityCount?: number;
  className?: string;
}

const COLUMN_CLASSES: Record<2 | 3 | 4, string> = {
  2: "grid-cols-1 sm:grid-cols-2",
  3: "grid-cols-2 lg:grid-cols-3",
  4: "grid-cols-2 lg:grid-cols-3 xl:grid-cols-4",
};

const SIZES: Record<2 | 3 | 4, string> = {
  2: "(min-width: 640px) 45vw, 100vw",
  3: "(min-width: 1024px) 31vw, 48vw",
  4: "(min-width: 1280px) 23vw, (min-width: 1024px) 31vw, 48vw",
};

export function ProductGrid({
  products,
  columns = 4,
  priorityCount = 0,
  className,
}: ProductGridProps) {
  return (
    <div
      className={cn(
        "grid gap-x-4 gap-y-10 sm:gap-y-12 lg:gap-x-6",
        COLUMN_CLASSES[columns],
        className,
      )}
    >
      {products.map((product, index) => (
        <ProductCard
          key={product.id}
          product={asSummary(product)}
          priority={index < priorityCount}
          sizes={SIZES[columns]}
        />
      ))}
    </div>
  );
}

/**
 * Horizontally scrolling rail. Snaps to each card, keeps native scrolling and adds
 * previous/next arrows on desktop when the row actually overflows.
 *
 * The arrows live in `RailScroller`, a client component, because deciding whether
 * anything overflows requires measuring the DOM. The cards themselves are rendered
 * here on the server and passed down as children, so the projection boundary above
 * still holds and no catalogue prose reaches the browser.
 */
export function ProductRail({
  products,
  label = "products",
  className,
}: {
  products: GridProduct[];
  /** Names the rail for the arrow labels, e.g. "new arrivals". */
  label?: string;
  className?: string;
}) {
  return (
    <RailScroller label={label} className={className}>
      {products.map((product) => (
        <li
          key={product.id}
          className="w-[62vw] shrink-0 snap-start sm:w-[38vw] lg:w-[27vw] xl:w-[21vw]"
        >
          <ProductCard product={asSummary(product)} sizes="(min-width: 1280px) 21vw, 62vw" />
        </li>
      ))}
    </RailScroller>
  );
}
