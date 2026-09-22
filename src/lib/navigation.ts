import type { Category, Collection, StoreSettings } from "./types";

/**
 * Navigation is derived from live data, not a hard-coded list.
 *
 * Categories and collections are editable in the admin panel, so the header, mega
 * menus, mobile drawer and footer are all generated from whatever exists now. Add a
 * collection in admin and it appears in the navigation on the next request.
 */

export interface NavLink {
  label: string;
  href: string;
  /** Short note rendered under featured links in the mega menu. */
  note?: string;
}

export interface NavColumn {
  heading: string;
  links: NavLink[];
}

export interface NavItem {
  label: string;
  href: string;
  /** When present the item opens a mega menu on hover/focus. */
  columns?: NavColumn[];
  /** Editorial promo slot on the right of the mega menu. */
  feature?: {
    eyebrow: string;
    title: string;
    body: string;
    href: string;
    cta: string;
  };
}

/**
 * Primary navigation.
 *
 * Five top-level items and exactly **one** dropdown, on Shop.
 *
 * The rule this follows: a link appears in the header once. An earlier version had
 * three mega menus that between them listed every category twice and every collection
 * twice — roughly one header link per product in a thirty-three piece range. More
 * places to look is not more findable; it is just more to read before deciding.
 *
 * Where a dropdown was only a route to a single page, it is now a plain link. New In
 * goes straight to the collection. Collections goes to `/collections`, which is a
 * visual index with imagery and piece counts — better at its job than a text list
 * repeating what that page already shows.
 *
 * Shop keeps a dropdown because it is the one item where a shopper genuinely arrives
 * wanting to pick between eight destinations.
 */
export function buildPrimaryNav(
  categories: Category[],
  collections: Collection[],
  /** Hero product for the dropdown's editorial slot, if the catalogue has one. */
  feature?: { name: string; slug: string; tagline: string },
): NavItem[] {
  const hasNewArrivals = collections.some((collection) => collection.slug === "new-arrivals");
  const hasSale = collections.some((collection) => collection.slug === "sale");

  const items: NavItem[] = [];

  if (hasNewArrivals) {
    items.push({ label: "New In", href: "/collections/new-arrivals" });
  }

  items.push({
    label: "Shop",
    href: "/shop",
    columns: [
      {
        heading: "Categories",
        links: [
          /**
           * Kept as an explicit link rather than relying on the "Shop" trigger,
           * because on mobile the trigger is an expand button and never navigates.
           * Without this row there would be no way to reach `/shop` from a phone.
           */
          { label: "All clothing", href: "/shop" },
          ...categories.map((category) => ({
            label: category.name,
            href: `/shop/${category.slug}`,
          })),
        ],
      },
      {
        heading: "Shop by",
        links: [
          { label: "Women", href: "/shop?department=women" },
          { label: "Men", href: "/shop?department=men" },
          { label: "Unisex", href: "/shop?department=unisex" },
          { label: "Lower impact", href: "/shop?sustainable=1" },
        ],
      },
    ],
    feature: feature
      ? {
          eyebrow: "This week",
          title: feature.name,
          body: feature.tagline,
          href: `/product/${feature.slug}`,
          cta: "See the piece",
        }
      : undefined,
  });

  if (collections.length > 0) {
    items.push({ label: "Collections", href: "/collections" });
  }

  if (hasSale) items.push({ label: "Sale", href: "/collections/sale" });
  items.push({ label: "About Us", href: "/about" });

  return items;
}

export function buildFooterNav(
  collections: Collection[],
  settings: Pick<StoreSettings, "returnWindowDays">,
): NavColumn[] {
  return [
    {
      heading: "Shop",
      links: [
        ...collections.slice(0, 4).map((collection) => ({
          label: collection.name,
          href: `/collections/${collection.slug}`,
        })),
        { label: "All clothing", href: "/shop" },
      ],
    },
    {
      heading: "Client care",
      links: [
        { label: "Contact us", href: "/contact" },
        {
          label: `${settings.returnWindowDays}-day returns`,
          href: "/shipping-returns",
        },
        { label: "Size guide", href: "/size-guide" },
        { label: "Track an order", href: "/account/orders" },
        { label: "FAQ", href: "/faq" },
      ],
    },
    {
      heading: "The house",
      links: [
        { label: "About us", href: "/about" },
        { label: "Our story", href: "/about#story" },
        { label: "Repairs & care", href: "/faq#care" },
        { label: "Stores", href: "/about#stores" },
      ],
    },
    {
      heading: "Legal",
      links: [
        { label: "Terms of sale", href: "/terms" },
        { label: "Privacy policy", href: "/privacy" },
        { label: "Accessibility", href: "/accessibility" },
      ],
    },
  ];
}

export const accountNav: NavLink[] = [
  { label: "Overview", href: "/account" },
  { label: "Orders", href: "/account/orders" },
  { label: "Reviews", href: "/account/reviews" },
  { label: "Addresses", href: "/account/addresses" },
  { label: "Saved items", href: "/wishlist" },
];
