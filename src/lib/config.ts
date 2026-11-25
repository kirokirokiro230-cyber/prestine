import type {
  Category,
  Collection,
  EmailTemplate,
  PromoCode,
  SortKey,
} from "./types";

export const site = {
  name: "PRESTINE",
  legalName: "Prestine Atelier Ltd.",
  tagline: "Considered clothing, built to outlast the season.",
  description:
    "PRESTINE makes small-batch wardrobe essentials from natural fibres — tailored outerwear, hand-finished knitwear and denim, designed in London and made in family-run European mills.",
  url: "https://prestine.example.com",
  email: "clientcare@prestine.example.com",
  phone: "+44 20 7946 0102",
  address: "12 Redchurch Street, London E2 7DP",
  /** ISO 4217. Change this and every price reformats. */
  currency: "USD",
  locale: "en-US",
  /** Free shipping threshold in minor units. */
  freeShippingThreshold: 20000,
  /** Flat sales-tax rate applied at checkout. */
  taxRate: 0.08,
  // 7 calendar days, matching the published Return & Exchange Policy.
  returnWindowHours: 168,
  social: {
    instagram: "https://instagram.com",
    pinterest: "https://pinterest.com",
    youtube: "https://youtube.com",
  },
} as const;

export const categories: Category[] = [
  {
    slug: "outerwear",
    name: "Outerwear",
    blurb: "Wool-rich coats and weatherproof shells cut for layering.",
    silhouette: "coat",
  },
  {
    slug: "knitwear",
    name: "Knitwear",
    blurb: "Fully-fashioned cashmere, merino and cotton, finished by hand.",
    silhouette: "sweater",
  },
  {
    slug: "shirts",
    name: "Shirts",
    blurb: "Long-staple poplin and washed linen with mother-of-pearl buttons.",
    silhouette: "shirt",
  },
  {
    slug: "tees",
    name: "T-Shirts",
    blurb: "Heavyweight organic jersey that holds its shape after fifty washes.",
    silhouette: "tee",
  },
  {
    slug: "trousers",
    name: "Trousers",
    blurb: "Pleated wool, cotton twill and drawstring tailoring.",
    silhouette: "trouser",
  },
  {
    slug: "denim",
    name: "Denim",
    blurb: "Selvedge and comfort stretch woven in Okayama and Candiani.",
    silhouette: "jean",
  },
  {
    slug: "dresses",
    name: "Dresses",
    blurb: "Bias-cut silk, poplin shirt dresses and knitted column shapes.",
    silhouette: "dress",
  },
  {
    slug: "accessories",
    name: "Accessories",
    blurb: "Leather goods, scarves and belts to close the look.",
    silhouette: "accessory",
  },
];

export const collections: Collection[] = [
  {
    slug: "new-arrivals",
    name: "New Arrivals",
    blurb: "The latest pieces to land in the atelier.",
    description:
      "Delivered weekly in small runs. Each piece is sampled three times before it reaches production, which is why our drops are modest and rarely repeated.",
  },
  {
    slug: "best-sellers",
    name: "Best Sellers",
    blurb: "The pieces our clients reorder in every colour.",
    description:
      "Ranked on repeat purchases rather than page views. If it lives here, someone has bought it twice.",
  },
  {
    slug: "essentials",
    name: "The Essentials",
    blurb: "Twelve pieces that carry a whole wardrobe.",
    description:
      "Our permanent collection — never discounted, never discontinued, restocked in the same colours season after season so a favourite can always be replaced.",
  },
  {
    slug: "the-tailoring-edit",
    name: "The Tailoring Edit",
    blurb: "Soft structure, natural shoulders, room to move.",
    description:
      "Tailoring built on a half-canvas construction with a lightly padded shoulder, cut to be worn with a knit rather than a tie.",
  },
  {
    slug: "autumn-winter",
    name: "Autumn / Winter",
    blurb: "Heavier weights, deeper tones, longer lines.",
    description:
      "Fabrics from 380gsm upward — brushed lambswool, double-faced cashmere and dry-finish moleskin, in a palette drawn from wet stone and winter bark.",
  },
  {
    slug: "sale",
    name: "Archive Sale",
    blurb: "Final pieces from past seasons, reduced once.",
    description:
      "Discontinued colourways and end-of-run sizes. Reduced a single time and sold as final — these do not return.",
  },
];

export const promoCodes: PromoCode[] = [
  {
    code: "WELCOME10",
    percentOff: 10,
    description: "10% off your first order",
  },
  {
    code: "ATELIER25",
    percentOff: 25,
    minSubtotal: 40000,
    description: "25% off orders over $400",
  },
  {
    code: "STUDIO50",
    amountOff: 5000,
    minSubtotal: 25000,
    description: "$50 off orders over $250",
  },
];

/**
 * Starter transactional email copy.
 *
 * Written to be sendable as-is rather than as placeholder text, because a merchant who
 * has to rewrite five emails before any of them work will turn the feature off instead.
 * Edit them at Admin → Email.
 *
 * Placeholders are documented in `src/server/email/templates.ts`, which owns the
 * substitution and is the single place that decides what a token resolves to.
 */
export const emailTemplates: EmailTemplate[] = [
  {
    key: "order-confirmation",
    enabled: true,
    subject: "Your {{storeName}} order {{orderId}}",
    heading: "Thank you, {{customerFirstName}}.",
    body: [
      "We have your order and we are getting it ready. You will hear from us again the moment it leaves us.",
      "{{itemLines}}",
      "Total paid: {{orderTotal}}",
      "Delivering to:\n{{shippingAddress}}",
      "Estimated arrival is {{deliveryEstimate}} from dispatch. You can check your order at any time at {{orderUrl}}.",
    ].join("\n\n"),
  },
  {
    key: "out-for-delivery",
    enabled: true,
    subject: "Your order {{orderId}} is on its way",
    heading: "It has left us.",
    body: [
      "Order {{orderId}} is with the courier and heading to you.",
      "{{trackingBlock}}",
      "Expected arrival is {{deliveryEstimate}}. Nobody needs to be home — the courier will leave it in a safe place if you are out.",
      "Track your order any time at {{orderUrl}}.",
    ].join("\n\n"),
  },
  {
    key: "delivered",
    enabled: true,
    subject: "Your order {{orderId}} has arrived",
    heading: "Delivered.",
    body: [
      "Order {{orderId}} has been delivered. We hope it was worth the wait.",
      "{{itemLines}}",
      "If anything is not right — the fit, the colour, a fault — reply to this email and we will sort it out. You can request a return or exchange within {{returnWindow}} of delivery.",
    ].join("\n\n"),
  },
  {
    key: "review-request",
    enabled: true,
    subject: "How is your {{storeName}} order?",
    heading: "How did we do?",
    body: [
      "You received order {{orderId}} a little while ago, so you have had a chance to wear it properly.",
      "{{itemLines}}",
      "If you have a minute, a short review helps the next person decide. Honest is more useful than kind — we would rather know.",
      "Leave a review at {{orderUrl}}.",
    ].join("\n\n"),
  },
  {
    key: "order-cancelled",
    enabled: true,
    subject: "Your order {{orderId}} has been cancelled",
    heading: "Your order is cancelled.",
    body: [
      "Order {{orderId}} has been cancelled and nothing further will be charged. Any payment already taken is refunded to the original payment method. Approved refunds are initiated within 5–7 business days, and your bank or payment provider may take additional time to show it.",
      "{{cancellationReason}}",
      "If this was not what you expected, reply to this email and we will look into it.",
    ].join("\n\n"),
  },
];

/**
 * Sort choices for listing pages.
 *
 * Lives here rather than beside the sorting logic because the `<SortSelect>` that
 * renders it is a client component — importing it from `catalog.ts` would pull the
 * entire product catalogue into the browser bundle.
 */
export const sortOptions: Array<{ value: SortKey; label: string }> = [
  { value: "featured", label: "Featured" },
  { value: "newest", label: "Newest" },
  { value: "price-asc", label: "Price: low to high" },
  { value: "price-desc", label: "Price: high to low" },
  { value: "rating", label: "Top rated" },
  { value: "name-asc", label: "Alphabetical" },
];
