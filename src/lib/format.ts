import { site } from "./config";

/**
 * All money in this app is an integer number of minor units (cents). Formatting
 * happens here and only here.
 */

const moneyFormatter = new Intl.NumberFormat(site.locale, {
  style: "currency",
  currency: site.currency,
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const moneyFormatterWithCents = new Intl.NumberFormat(site.locale, {
  style: "currency",
  currency: site.currency,
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Build a money formatter for a currency chosen at runtime.
 *
 * The storefront uses the compile-time `formatMoney` below; the admin panel needs
 * this because a merchant can change the store currency in settings.
 */
export function createMoneyFormatter(currency: string, locale: string) {
  const whole = new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
  const withCents = new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  return (minorUnits: number): string =>
    minorUnits % 100 === 0
      ? whole.format(minorUnits / 100)
      : withCents.format(minorUnits / 100);
}

/**
 * Format minor units as a display price.
 *
 * Whole amounts render without decimals (`$795`) because trailing `.00` reads
 * cheap on a premium catalogue; anything with cents keeps them (`$12.50`).
 */
export function formatMoney(minorUnits: number): string {
  const hasCents = minorUnits % 100 !== 0;
  const amount = minorUnits / 100;
  return hasCents
    ? moneyFormatterWithCents.format(amount)
    : moneyFormatter.format(amount);
}

/** Percentage saved between an original and a reduced price. */
export function discountPercent(price: number, compareAtPrice: number): number {
  if (compareAtPrice <= 0 || price >= compareAtPrice) return 0;
  return Math.round(((compareAtPrice - price) / compareAtPrice) * 100);
}

const longDate = new Intl.DateTimeFormat(site.locale, {
  day: "numeric",
  month: "long",
  year: "numeric",
});

const shortDate = new Intl.DateTimeFormat(site.locale, {
  day: "numeric",
  month: "short",
  year: "numeric",
});

export function formatDate(iso: string, style: "long" | "short" = "long"): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return style === "long" ? longDate.format(date) : shortDate.format(date);
}

/** "3 items" / "1 item" — avoids a stray "(s)" in the UI. */
export function pluralise(count: number, singular: string, plural?: string): string {
  return `${count} ${count === 1 ? singular : (plural ?? `${singular}s`)}`;
}

/**
 * Estimated delivery window as a human date range, counted in business days
 * from today. Used on the product page and in checkout.
 */
export function deliveryWindow(minDays: number, maxDays: number): string {
  const addBusinessDays = (days: number) => {
    const date = new Date();
    let added = 0;
    while (added < days) {
      date.setDate(date.getDate() + 1);
      const day = date.getDay();
      if (day !== 0 && day !== 6) added += 1;
    }
    return date;
  };

  const from = addBusinessDays(minDays);
  const to = addBusinessDays(maxDays);
  const fmt = new Intl.DateTimeFormat(site.locale, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });

  return `${fmt.format(from)} – ${fmt.format(to)}`;
}



/* ------------------------------------------------------------------ */
/* Addresses                                                           */
/* ------------------------------------------------------------------ */

/**
 * The recipient's name, from either address shape.
 *
 * Checkout now collects one `name` field. Orders placed before that carry
 * `firstName`/`lastName`, and they are stored whole in a jsonb column rather than
 * migrated — so every surface that prints a name has to handle both. Doing it here
 * once is the difference between one function and six places that each forget the
 * fallback and render "undefined undefined" on a historical order.
 */
export function addressName(address: AddressLike): string {
  if (address.name?.trim()) return address.name.trim();

  const legacy = `${address.firstName ?? ""} ${address.lastName ?? ""}`.trim();
  return legacy || "—";
}

/**
 * A one-line address for order confirmations, the account area and admin.
 *
 * Empty parts are dropped rather than rendered as stray commas, which is what
 * happens on a legacy order with no `region` or a current one with no postcode.
 */
export function formatAddress(address: AddressLike): string {
  return [
    addressName(address),
    address.line1,
    address.line2,
    address.city,
    [address.region, address.postalCode].filter(Boolean).join(" ").trim(),
    address.country,
  ]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(", ");
}

/**
 * Structurally typed rather than importing `Address`, so this stays usable from
 * client components without pulling the whole domain type graph into the bundle.
 */
interface AddressLike {
  name?: string;
  firstName?: string;
  lastName?: string;
  line1?: string;
  line2?: string;
  city?: string;
  region?: string;
  postalCode?: string;
  country?: string;
}
