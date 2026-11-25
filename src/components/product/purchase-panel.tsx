"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ArrowsCounterClockwise,
  Heart,
  Leaf,
  ShieldCheck,
  Truck,
} from "@phosphor-icons/react";
import { useCart } from "@/components/providers/cart-provider";
import { useWishlist } from "@/components/providers/wishlist-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Price } from "@/components/ui/price";
import { QuantityStepper } from "@/components/ui/quantity-stepper";
import { Rating } from "@/components/ui/rating";
import { useResetOnChange } from "@/hooks/use-store";
import { MAX_LINE_QUANTITY } from "@/lib/cart-math";
import { createMoneyFormatter } from "@/lib/format";
import type { ProductSummary, ServicePromise } from "@/lib/types";
import { cn } from "@/lib/utils";
import { DeliveryCheck } from "./delivery-check";
import { SizeGuideModal } from "./size-guide-modal";

/**
 * Icons for the service rows, matched to promises by position.
 *
 * Elements rather than components so the list reads as data at the point of use, and
 * so the `size`/`aria-hidden` props cannot drift between the three rows.
 */
const SERVICE_ICONS = [
  <Truck key="delivery" size={16} aria-hidden />,
  <ArrowsCounterClockwise key="returns" size={16} aria-hidden />,
  <ShieldCheck key="repairs" size={16} aria-hidden />,
];

/**
 * The slice of store settings this panel needs.
 *
 * Passed in rather than imported, because a merchant can change currency, the
 * free-shipping threshold or the returns window in admin, and this is a client
 * component that must not pull the server store into the browser bundle.
 */
export interface PurchaseSettings {
  currency: string;
  locale: string;
  email: string;
  freeShippingThreshold: number;
  /**
   * The same list the footer renders, so a merchant editing a delivery promise once
   * sees it change in both places. Previously this panel had its own hardcoded copy of
   * the three sentences, which is exactly how two surfaces end up disagreeing about
   * the returns window.
   */
  servicePromises: ServicePromise[];
}

/**
 * Variant selection and add-to-bag.
 *
 * Key decisions:
 * - The chosen colour is mirrored into the URL (`?color=`) with `replace`, so the
 *   page can be shared or refreshed on the same variant without polluting history.
 * - Every size the product is offered in is always selectable. The shop does not track
 *   inventory, so there is no disabled or struck-through state to communicate.
 * - Nothing is added until a size is picked, and the error is announced rather
 *   than only shown in red.
 */
export function PurchasePanel({
  product,
  fitNote,
  initialColorId,
  deliveryDays,
  settings,
}: {
  product: ProductSummary;
  /** Passed separately: it is the one long-form field this panel needs. */
  fitNote: string;
  initialColorId?: string;
  /** The standing delivery promise, for the PIN code check below the buttons. */
  deliveryDays: { min: number; max: number };
  settings: PurchaseSettings;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const { addItem, quantityOf, openCart } = useCart();
  const { hasVariant, toggle } = useWishlist();

  const money = useMemo(
    () => createMoneyFormatter(settings.currency, settings.locale),
    [settings.currency, settings.locale],
  );

  const initialIndex = Math.max(
    0,
    product.colors.findIndex((c) => c.id === initialColorId),
  );
  const [colorIndex, setColorIndex] = useState(initialIndex);
  const [size, setSize] = useState<string | null>(
    product.sizeSystem === "one-size" ? product.sizes[0]?.label ?? null : null,
  );
  const [quantity, setQuantity] = useState(1);
  const [error, setError] = useState<string | null>(null);

  const color = product.colors[colorIndex] ?? product.colors[0];
  const saved = hasVariant(product.id, color.id);

  /**
   * How many more of this size can be added.
   *
   * Not an inventory figure — the shop does not track stock. It is the per-order cap
   * less whatever is already in the bag, so the stepper cannot offer a quantity the
   * cart would then refuse.
   */
  const inBag = size ? quantityOf(product.id, color.id, size) : 0;
  const ceiling = Math.max(0, MAX_LINE_QUANTITY - inBag);

  // Keep the URL in step with the selected colour.
  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    if (params.get("color") === color.id) return;
    params.set("color", color.id);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }, [color.id, pathname, router, searchParams]);

  // Reset quantity when the variant changes, so a count chosen for one size does not
  // carry over to another.
  useResetOnChange(`${color.id}:${size ?? ""}`, () => setQuantity(1));

  /**
   * Add to the bag. Returns whether it worked, so "Buy now" can build on it rather
   * than duplicating the guards — a second copy of the size check is a second place
   * for it to fall out of date.
   */
  const addToBag = (): boolean => {
    if (!size) {
      setError("Choose a size to continue.");
      return false;
    }
    const result = addItem({ product, colorId: color.id, size, quantity });
    if (!result.ok) {
      setError(result.reason ?? "That variant is unavailable.");
      return false;
    }
    setError(null);
    return true;
  };

  const handleAdd = () => {
    addToBag();
  };

  /**
   * Straight to checkout.
   *
   * The item still goes through the bag rather than a separate express path: the cart
   * is where quantity limits, promotion codes and the shipping threshold are applied,
   * and a parallel route to checkout would have to reimplement all three. `addItem` is
   * synchronous, so the push happens in the same handler with nothing to await.
   *
   * Anything already in the bag comes along. Silently checking out one item and
   * abandoning the rest would be a worse surprise than including them.
   */
  const handleBuyNow = () => {
    if (!addToBag()) return;
    router.push("/checkout");
  };

  return (
    <div className="flex flex-col">
      {/* Title block */}
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/shop/${product.category}`}
            className="eyebrow link-underline hover:text-content"
          >
            {product.category.replace("-", " ")}
          </Link>
          {product.sustainable ? (
            <Badge tone="eco">
              <Leaf size={10} weight="fill" aria-hidden />
              Lower impact
            </Badge>
          ) : null}
        </div>

        <h1 className="mt-3 text-3xl leading-[1.1] sm:text-4xl">{product.name}</h1>
        <p className="mt-2.5 text-sm text-content-muted">{product.tagline}</p>

        <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2">
          <Price value={product.price} compareAt={product.compareAtPrice} size="lg" showDiscount />
          <a href="#reviews" className="inline-flex items-center gap-2">
            <Rating value={product.rating} reviewCount={product.reviewCount} />
            <span className="link-underline text-xs text-content-muted">Read reviews</span>
          </a>
        </div>
      </div>

      {/* Colour */}
      <div className="mt-8">
        <div className="flex items-baseline justify-between gap-4">
          <p className="eyebrow">
            Colour — <span className="text-content">{color.name}</span>
          </p>
          <p className="text-2xs text-content-subtle">
            {product.colors.length} {product.colors.length === 1 ? "colourway" : "colourways"}
          </p>
        </div>

        <div
          role="radiogroup"
          aria-label="Colour"
          className="mt-3 flex flex-wrap items-center gap-2"
        >
          {product.colors.map((option, index) => {
            const active = index === colorIndex;
            return (
              <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={active}
                aria-label={option.name}
                title={option.name}
                onClick={() => setColorIndex(index)}
                className="grid size-11 place-items-center"
              >
                <span
                  aria-hidden
                  style={{ backgroundColor: option.hex }}
                  className={cn(
                    "block size-7 rounded-full ring-1 ring-inset ring-black/15 transition-[box-shadow]",
                    active && "ring-2 ring-offset-2 ring-offset-canvas ring-content",
                  )}
                />
              </button>
            );
          })}
        </div>
      </div>

      {/* Size */}
      {product.sizeSystem !== "one-size" ? (
        <div className="mt-7">
          <div className="flex items-baseline justify-between gap-4">
            <p className="eyebrow">
              Size {size ? <span className="text-content">— {size}</span> : null}
            </p>
            <SizeGuideModal system={product.sizeSystem} selectedSize={size} />
          </div>

          <div
            role="radiogroup"
            aria-label="Size"
            aria-describedby={error ? "size-error" : undefined}
            className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6"
          >
            {product.sizes.map((option) => {
              const active = option.label === size;

              return (
                <button
                  key={option.label}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => {
                    setSize(option.label);
                    setError(null);
                  }}
                  className={cn(
                    "h-12 border text-sm transition-colors",
                    active
                      ? "border-inverse bg-inverse text-on-inverse"
                      : "border-line-strong text-content hover:border-content",
                  )}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {error ? (
        <p
          id="size-error"
          role="alert"
          className="mt-4 text-xs text-danger-500 dark:text-danger-100"
        >
          {error}
        </p>
      ) : null}

      {/* Quantity + actions */}
      <div className="mt-8 flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <QuantityStepper
            value={quantity}
            min={1}
            max={Math.max(1, ceiling)}
            onChange={setQuantity}
            label={`Quantity of ${product.name}`}
          />
          {inBag > 0 ? (
            <p className="text-xs text-content-muted">
              {inBag} already in your bag
            </p>
          ) : null}
        </div>

        <div className="flex gap-2">
          <Button
            size="lg"
            block
            variant="outline"
            onClick={handleAdd}
            disabled={ceiling === 0}
          >
            {ceiling === 0
              ? `Limit of ${MAX_LINE_QUANTITY} per size`
              : `Add to bag — ${money(product.price * quantity)}`}
          </Button>

          <Button
            variant="outline"
            size="icon"
            onClick={() => toggle(product, color.id)}
            aria-pressed={saved}
            aria-label={saved ? "Remove from saved items" : "Save for later"}
            className={cn("h-14 w-14 shrink-0", saved && "text-danger-500 dark:text-clay-300")}
          >
            <Heart size={19} weight={saved ? "fill" : "regular"} aria-hidden />
          </Button>
        </div>

        {/*
          Buy now is the primary action and sits below the pair, full width: it is the
          widest target and the last thing read before the service promises. "Add to
          bag" steps down to outline so the two do not compete — two solid buttons of
          equal weight is how a shopper ends up clicking neither.
        */}
        <Button size="lg" block onClick={handleBuyNow} disabled={ceiling === 0}>
          Buy now
        </Button>

        <Button variant="ghost" size="md" onClick={openCart} className="justify-center">
          View bag
        </Button>
      </div>

      {/* Service reassurance */}
      <dl className="mt-8 flex flex-col divide-y divide-line border-y border-line">
        {/*
          Icons are matched by position and stay in code — see the same reasoning in
          the footer. The delivery window is still computed here because "arrives
          Tuesday" depends on today's date, which no settings field can hold.
        */}
        {settings.servicePromises.map((promise, index) => (
          <ServiceRow
            key={promise.title}
            icon={SERVICE_ICONS[index % SERVICE_ICONS.length]}
            term={promise.title}
            description={promise.body}
          />
        ))}
      </dl>

      {/*
        Below the service promises rather than above the buttons: a shopper checks a PIN
        code once they have decided they want the piece, and putting a form between the
        size picker and Buy now would interrupt the path to purchase.
      */}
      <DeliveryCheck daysMin={deliveryDays.min} daysMax={deliveryDays.max} />

      <p className="mt-6 text-xs leading-relaxed text-content-subtle">{fitNote}</p>
    </div>
  );
}

function ServiceRow({
  icon,
  term,
  description,
}: {
  icon: React.ReactNode;
  term: string;
  description: React.ReactNode;
}) {
  return (
    <div className="flex gap-3 py-4">
      <span className="mt-0.5 shrink-0 text-content-muted">{icon}</span>
      <div className="min-w-0">
        <dt className="text-2xs font-medium uppercase tracking-[0.12em] text-content">
          {term}
        </dt>
        <dd className="mt-1 text-xs leading-relaxed text-content-muted">{description}</dd>
      </div>
    </div>
  );
}
