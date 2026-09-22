import Link from "next/link";
import { GarmentArt } from "@/components/product/garment-art";
import type { Order } from "@/lib/types";

/**
 * Line items plus totals for a placed order. Shared by the confirmation page and
 * the order history detail, so a receipt always looks the same.
 *
 * Renders artwork from the order's own snapshot rather than looking products up:
 * both callers are client components, and a receipt should show what was bought at
 * the time regardless of whether the product still exists.
 *
 * The formatter is a prop rather than an import, because the store currency is a
 * setting. It is not taken from the cart context — a receipt has nothing to do with
 * the current bag, and coupling the two would be the wrong dependency.
 */
export function OrderLines({
  order,
  money,
}: {
  order: Order;
  money: (minorUnits: number) => string;
}) {
  return (
    <div>
      <ul className="divide-y divide-line border-y border-line">
        {order.lines.map((line, index) => {
          return (
            <li key={`${line.slug}-${line.size}-${index}`} className="flex gap-4 py-5">
              <div className="relative w-16 shrink-0 overflow-hidden bg-surface-sunken">
                <div className="aspect-3/4">
                  <GarmentArt
                    product={{
                      id: line.slug,
                      slug: line.slug,
                      name: line.name,
                      category: line.category,
                    }}
                    colorHex={line.colorHex}
                    colorName={line.colorName}
                  />
                </div>
              </div>

              <div className="flex min-w-0 flex-1 items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="font-sans text-sm font-medium leading-snug">
                    <Link href={`/product/${line.slug}`} className="hover:text-accent">
                      {line.name}
                    </Link>
                  </h3>
                  <p className="mt-1 flex items-center gap-2 text-xs text-content-muted">
                    <span
                      aria-hidden
                      style={{ backgroundColor: line.colorHex }}
                      className="inline-block size-2.5 rounded-full ring-1 ring-inset ring-black/12"
                    />
                    {line.colorName}
                    <span aria-hidden className="text-content-subtle">
                      ·
                    </span>
                    Size {line.size}
                    <span aria-hidden className="text-content-subtle">
                      ·
                    </span>
                    <span data-numeric>Qty {line.quantity}</span>
                  </p>
                </div>

                <span data-numeric className="shrink-0 text-sm">
                  {money(line.unitPrice * line.quantity)}
                </span>
              </div>
            </li>
          );
        })}
      </ul>

      <dl className="mt-5 flex flex-col gap-2.5 text-sm">
        <Row term="Subtotal">{money(order.totals.subtotal)}</Row>
        {order.totals.discount > 0 ? (
          <Row term="Discount" positive>
            −{money(order.totals.discount)}
          </Row>
        ) : null}
        <Row term="Shipping">
          {order.totals.shipping === 0 ? "Complimentary" : money(order.totals.shipping)}
        </Row>
        <Row term="Tax">{money(order.totals.tax)}</Row>
        <div className="mt-1 flex items-baseline justify-between border-t border-line pt-3">
          <dt className="font-medium">Total</dt>
          <dd data-numeric className="text-base">
            {money(order.totals.total)}
          </dd>
        </div>
      </dl>
    </div>
  );
}

function Row({
  term,
  positive,
  children,
}: {
  term: string;
  positive?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-content-muted">{term}</dt>
      <dd
        data-numeric
        className={
          positive ? "text-success-700 dark:text-success-500" : "text-content"
        }
      >
        {children}
      </dd>
    </div>
  );
}
