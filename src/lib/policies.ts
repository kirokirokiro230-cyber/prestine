import { RETURNS_EMAIL, WEBSITE, grievanceOfficer } from "./business";
import type { StoreSettings } from "./types";

/**
 * The policy pages and the FAQ, as data.
 *
 * Written once here and rendered by the pages, so the wording is in one reviewable place and
 * a test can check it (no placeholder left in, every token filled, every page present).
 * Legal text is easier to get right as a document than as markup scattered across routes.
 *
 * ## Inline markup
 *
 * Plain strings with two conventions, parsed by `src/components/layout/policy-text.tsx`:
 *
 * - `**bold**`
 * - `[label](href)` for a link. Only `/path`, `mailto:` and `https://` links are honoured.
 *
 * ## Tokens
 *
 * `{{name}}` is replaced from the store's settings when the page renders (`policyVars`), so
 * the support email, phone and address come from Admin → Settings rather than being typed in
 * twice. A line whose tokens are all empty is dropped by the key/value blocks instead of
 * being shown half-empty.
 */

export type PolicyBlock =
  | { type: "p"; text: string }
  | { type: "ul"; items: string[] }
  | { type: "ol"; items: string[] }
  /** Label: value lines. A line with an empty value is left out. */
  | { type: "kv"; items: Array<{ label: string; value: string }> };

export interface PolicySection {
  heading?: string;
  blocks: PolicyBlock[];
}

export interface Policy {
  /** Route, e.g. `/privacy`. */
  path: string;
  title: string;
  /** Meta description. */
  description: string;
  sections: PolicySection[];
}

const p = (text: string): PolicyBlock => ({ type: "p", text });
const ul = (...items: string[]): PolicyBlock => ({ type: "ul", items });
const ol = (...items: string[]): PolicyBlock => ({ type: "ol", items });

const RETURNS_MAILTO = `[${RETURNS_EMAIL}](mailto:${RETURNS_EMAIL})`;
const SUPPORT_MAILTO = "[{{supportEmail}}](mailto:{{supportEmail}})";

/* ------------------------------------------------------------------ */
/* Privacy Policy                                                      */
/* ------------------------------------------------------------------ */

const privacy: Policy = {
  path: "/privacy",
  title: "Privacy Policy",
  description:
    "How Kabuda collects, uses, stores and protects your personal information when you visit the website or buy our products.",
  sections: [
    {
      heading: "Introduction",
      blocks: [
        p(
          "At Kabuda, we respect your privacy and are committed to protecting your personal information. This Privacy Policy explains how we collect, use, store, and protect your information when you visit our website or purchase our products.",
        ),
      ],
    },
    {
      heading: "Information We Collect",
      blocks: [
        p("We may collect the following information:"),
        ul(
          "Name, phone number, email address, and shipping/billing address.",
          "Order details, purchase history, and customer support communications.",
          "Payment transaction information necessary to process orders.",
          "Technical information such as IP address, browser type, device information, and website usage data.",
          "Cookie and marketing preferences, where applicable.",
        ),
      ],
    },
    {
      heading: "How We Use Your Information",
      blocks: [
        p("We use your information to:"),
        ul(
          "Process and deliver orders.",
          "Manage payments, returns, exchanges, and refunds.",
          "Provide customer support and order updates.",
          "Improve our products, website, and customer experience.",
          "Detect fraud, prevent misuse, and protect website security.",
          "Send promotional communications where permitted and, where required, with your consent.",
        ),
      ],
    },
    {
      heading: "Sharing of Information",
      blocks: [
        p(
          "We may share relevant information with trusted service providers, including payment processors, shipping partners, website hosting providers, analytics services, and customer support providers, where necessary for business operations or as permitted by law.",
        ),
        p("We do not sell personal information to third parties."),
      ],
    },
    {
      heading: "Data Security and Retention",
      blocks: [
        p(
          "We take reasonable measures to protect personal information against unauthorized access, loss, misuse, or disclosure. Information is retained only for as long as reasonably necessary for the purposes described in this policy or as required by applicable law.",
        ),
      ],
    },
    {
      heading: "Cookies and Tracking",
      blocks: [
        p(
          "Our website may use cookies and similar technologies to maintain website functionality, understand website traffic, and measure advertising performance. Available cookie controls and consent options may depend on the technologies used on our website.",
        ),
      ],
    },
    {
      heading: "Your Rights",
      blocks: [
        p(
          "Subject to applicable law, you may request access to, correction of, or deletion of your personal information, or withdraw consent where applicable. Certain records may need to be retained for legal, tax, accounting, or dispute-resolution purposes.",
        ),
      ],
    },
    {
      heading: "Contact",
      blocks: [
        p("For privacy-related questions, contact us at:"),
        { type: "kv", items: [{ label: "Email", value: SUPPORT_MAILTO }] },
      ],
    },
  ],
};

/* ------------------------------------------------------------------ */
/* Terms & Conditions                                                  */
/* ------------------------------------------------------------------ */

const terms: Policy = {
  path: "/terms",
  title: "Terms & Conditions",
  description:
    "The terms that apply when you use the Kabuda website or buy from us: products, pricing, payments, orders and liability.",
  sections: [
    {
      heading: "Acceptance of Terms",
      blocks: [
        p(
          "By accessing or purchasing from the Kabuda website, you agree to these Terms & Conditions and applicable policies displayed on our website.",
        ),
      ],
    },
    {
      heading: "Products and Descriptions",
      blocks: [
        p(
          "We make reasonable efforts to display accurate product descriptions, colours, sizes, images, and prices. Actual colours may vary slightly due to screen settings, lighting, or photography.",
        ),
        p("Please review product descriptions and size charts before placing an order."),
      ],
    },
    {
      heading: "Pricing and Payments",
      blocks: [
        p(
          "All prices on the Kabuda website are displayed in Indian Rupees (INR) and are inclusive of applicable taxes. Delivery charges will be displayed separately at checkout before the customer completes the order. If a customer selects Cash on Delivery (COD), any applicable COD charges will also be displayed at checkout and added to the final order total before confirmation.",
        ),
        p(
          "Orders are subject to successful payment or confirmation of an available Cash on Delivery service.",
        ),
      ],
    },
    {
      heading: "Orders and Availability",
      blocks: [
        p(
          "Order confirmation does not prevent cancellation where permitted by our policies or applicable law. We reserve the right to contact customers to verify order details and to address suspected fraud, stock errors, or technical pricing errors in accordance with applicable law.",
        ),
        p(
          "If an order cannot be fulfilled, the customer will be informed and any applicable refund will be processed.",
        ),
      ],
    },
    {
      heading: "Intellectual Property",
      blocks: [
        p(
          "All Kabuda trademarks, logos, designs, product photographs, written content, and other brand assets are owned by or licensed to Kabuda. They may not be copied, reproduced, or commercially used without prior written permission.",
        ),
      ],
    },
    {
      heading: "Limitation of Liability",
      blocks: [
        p(
          "Nothing in these terms excludes or limits any consumer rights or liability that cannot lawfully be excluded or limited under applicable law.",
        ),
      ],
    },
    {
      heading: "Changes to Terms",
      blocks: [
        p(
          "We may update these Terms & Conditions from time to time. Updated terms will be published on this page with a revised date.",
        ),
      ],
    },
  ],
};

/* ------------------------------------------------------------------ */
/* Return & Exchange Policy                                            */
/* ------------------------------------------------------------------ */

const returnExchange: Policy = {
  path: "/return-exchange-policy",
  title: "Return & Exchange Policy",
  description:
    "Kabuda's 7-day return and exchange policy: eligibility, how to request one, return shipping charges and product inspection.",
  sections: [
    {
      heading: "Return and Exchange Window",
      blocks: [
        p(
          "Customers may request a return or exchange within 7 calendar days of delivery, subject to the eligibility conditions outlined below.",
        ),
      ],
    },
    {
      heading: "Return Policy",
      blocks: [
        p(
          "Customers may request a return if they are not satisfied with the product, including if they do not like the product after receiving it.",
        ),
        p("To qualify for a return, the product must:"),
        ul(
          "Be unused, unworn, unwashed, and undamaged.",
          "Have its original tags, labels, and packaging, where applicable.",
          "Be accompanied by the order number or proof of purchase.",
        ),
        p(
          "Products that have been worn, washed, altered, or damaged by the customer, or that are missing essential tags, may not qualify for a return, except where applicable law provides otherwise.",
        ),
      ],
    },
    {
      heading: "Exchange Policy",
      blocks: [
        p(
          "Customers may request an exchange within 7 calendar days of delivery for the following reasons:",
        ),
        ul(
          "**Size or fit issues:** If the purchased size does not fit properly, subject to availability.",
          "**Incorrect product delivered:** If the customer receives a different product from the one ordered.",
          "**Damaged or defective product:** If the product arrives damaged or has a manufacturing defect.",
          "**Product differs from its description:** If the product materially differs from its advertised description.",
        ),
        p(
          "All exchange requests are subject to product availability and the eligibility conditions stated in this policy.",
        ),
      ],
    },
    {
      heading: "How to Request a Return or Exchange",
      blocks: [
        ol(
          `Submit a return or exchange request through our [Return & Exchange Portal](/account/orders) or email ${RETURNS_MAILTO} within 7 calendar days of delivery.`,
          "Provide your order number and the reason for the return or exchange. Include clear photographs where relevant.",
          "Wait for instructions before shipping the product back.",
          "Pack the product securely with its original tags and packaging, where applicable.",
        ),
      ],
    },
    {
      heading: "Return Shipping Charges",
      blocks: [
        p(
          "For approved return requests, the applicable return shipping charges will be deducted from the customer's refund amount.",
        ),
      ],
    },
    {
      heading: "Exchange Policy — Free of Cost",
      blocks: [
        p(
          "Approved exchanges are free of cost. No shipping or exchange charges will be deducted from the customer for an approved exchange request.",
        ),
        p(
          "Customers may request an exchange within 7 calendar days of delivery for eligible size or fit issues, incorrect products, damaged or defective products, or products that materially differ from their advertised descriptions. All exchanges are subject to product availability.",
        ),
      ],
    },
    {
      heading: "Product Inspection",
      blocks: [
        p(
          "All products returned for exchange will be inspected before approval. Products must be unused, unworn, unwashed, unaltered, and undamaged, with their original tags and labels intact, where applicable.",
        ),
        p(
          "If an exchange request is rejected after inspection because the product does not meet these eligibility conditions, the same product will be returned to the customer in the condition in which it was received by Kabuda. The customer may be required to pay the applicable shipping charges for returning the rejected product. These charges will be communicated to the customer before the product is shipped back. No such charge will apply where the customer is entitled to a free remedy under applicable law.",
        ),
      ],
    },
  ],
};

/* ------------------------------------------------------------------ */
/* Refund & Cancellation Policy                                        */
/* ------------------------------------------------------------------ */

const refundCancellation: Policy = {
  path: "/refund-cancellation-policy",
  title: "Refund & Cancellation Policy",
  description:
    "How to cancel a Kabuda order, when refunds are available, how long they take and how they are paid.",
  sections: [
    {
      heading: "Order Cancellation",
      blocks: [
        p(
          "Customers may request cancellation before an order is dispatched by contacting our support team.",
        ),
        p(
          "Cancellation requests made after dispatch may be handled under the applicable return policy. This does not affect any cancellation right available under applicable law.",
        ),
        p(
          "Kabuda will not impose a cancellation charge on a customer unless such charge is lawful and the applicable requirements are satisfied.",
        ),
      ],
    },
    {
      heading: "Refund Eligibility",
      blocks: [
        p("Refunds may be available for:"),
        ul(
          "Approved eligible returns.",
          "Orders cancelled before dispatch.",
          "Orders that Kabuda cannot fulfil.",
          "Failed or duplicate payments, where applicable.",
          "Products that qualify for a refund under applicable consumer law.",
        ),
      ],
    },
    {
      heading: "Refund Processing",
      blocks: [
        p("Once a return is received and inspected, we will notify the customer of the outcome."),
        p(
          "Approved refunds will be initiated within 5–7 business days after approval, subject to the applicable payment method and processing requirements. The time taken for the amount to appear in the customer's account may depend on the bank or payment provider.",
        ),
        p("Where a different timeline is required by law, the legally applicable timeline will prevail."),
      ],
    },
    {
      heading: "Refund Method",
      blocks: [
        p(
          "Refunds will generally be issued to the original payment method. For Cash on Delivery orders, the customer may be asked to provide an appropriate bank account or other permitted refund details through a secure channel.",
        ),
        p("Customers should never share their UPI PIN, card PIN, or OTP to receive a refund."),
      ],
    },
    {
      heading: "Shipping Charges for Returns",
      blocks: [
        p(
          "The original shipping charges paid at the time of purchase are non-refundable, except where a refund is required by applicable law.",
        ),
        p(
          "For approved returns, applicable return shipping charges will also be deducted from the customer's refund amount. The refund will be calculated after deducting the original shipping charges and any applicable return shipping charges from the total amount paid, subject to applicable law.",
        ),
      ],
    },
  ],
};

/* ------------------------------------------------------------------ */
/* Shipping & Delivery Policy                                          */
/* ------------------------------------------------------------------ */

const shippingDelivery: Policy = {
  path: "/shipping-delivery-policy",
  title: "Shipping & Delivery Policy",
  description:
    "How long Kabuda orders take to process and deliver, what shipping costs, and what to do if an order is delayed, lost or damaged.",
  sections: [
    {
      heading: "Order Processing",
      blocks: [
        p(
          "Orders are generally processed within 1–3 business days after confirmation, excluding public holidays and unforeseen operational disruptions.",
        ),
      ],
    },
    {
      heading: "Estimated Delivery",
      blocks: [
        p(
          "Estimated delivery is generally 3–7 business days after dispatch for serviceable locations in India. Remote locations may require additional time.",
        ),
        p(
          "These are estimates, not guaranteed delivery dates. Any more specific delivery estimate shown during checkout should be considered alongside this policy.",
        ),
      ],
    },
    {
      heading: "Shipping Charges",
      blocks: [
        p(
          "Applicable shipping charges, including any eligible free-shipping offer, will be displayed before payment is completed.",
        ),
      ],
    },
    {
      heading: "Order Tracking",
      blocks: [
        p(
          "Where tracking is available, customers will receive tracking details through the contact information provided at checkout.",
        ),
      ],
    },
    {
      heading: "Incorrect Address or Failed Delivery",
      blocks: [
        p(
          "Customers should verify their shipping address and contact details before placing an order. Incorrect details, unsuccessful delivery attempts, or customer unavailability may cause delays.",
        ),
      ],
    },
    {
      heading: "Lost, Damaged, or Delayed Orders",
      blocks: [
        p(
          `If an order appears lost, arrives damaged, or is significantly delayed, customers should contact ${SUPPORT_MAILTO} with their order number.`,
        ),
        p(
          "Kabuda will investigate with the shipping partner and provide an appropriate resolution in accordance with applicable law and the circumstances of the order.",
        ),
      ],
    },
  ],
};

/* ------------------------------------------------------------------ */
/* Grievance Redressal Policy                                          */
/* ------------------------------------------------------------------ */

const grievance: Policy = {
  path: "/grievance-redressal",
  title: "Grievance Redressal Policy",
  description:
    "How to raise a complaint with Kabuda, who the Grievance Officer is, and how quickly complaints are acknowledged and resolved.",
  sections: [
    {
      blocks: [
        p("Kabuda is committed to addressing customer complaints fairly and promptly."),
        p(
          "Customers may contact us regarding orders, payments, delivery, product quality, returns, refunds, or privacy concerns.",
        ),
      ],
    },
    {
      heading: "Customer Support Details",
      blocks: [
        {
          type: "kv",
          items: [
            { label: "Business / Legal Entity Name", value: "{{legalName}}" },
            { label: "Customer Support Email", value: SUPPORT_MAILTO },
            { label: "Customer Support Phone", value: "{{supportPhone}}" },
            { label: "Registered / Principal Business Address", value: "{{address}}" },
          ],
        },
      ],
    },
    {
      heading: "Grievance Officer",
      blocks: [
        {
          type: "kv",
          items: [
            { label: "Name", value: "{{officerName}}" },
            { label: "Designation", value: "{{officerDesignation}}" },
            { label: "Email", value: "[{{officerEmail}}](mailto:{{officerEmail}})" },
            { label: "Contact Number", value: "{{officerPhone}}" },
            { label: "Address", value: "{{officerAddress}}" },
          ],
        },
        p(
          "Customers should include their order number, contact information, and a clear description of their complaint when contacting us.",
        ),
        p(
          "Kabuda will acknowledge receipt of consumer complaints within 48 hours and address them within one month from the date of receipt, in accordance with applicable law.",
        ),
        p(
          "Nothing in this policy restricts a customer's right to approach the appropriate consumer authority or forum.",
        ),
      ],
    },
  ],
};

/* ------------------------------------------------------------------ */
/* Payment Policy                                                      */
/* ------------------------------------------------------------------ */

const payment: Policy = {
  path: "/payment-policy",
  title: "Payment Policy",
  description:
    "The payment methods Kabuda accepts, how online payments are processed, and what to do if a payment is debited but the order is not confirmed.",
  sections: [
    {
      blocks: [
        p(
          "Kabuda may offer payment methods such as UPI, debit cards, credit cards, net banking, digital wallets, or Cash on Delivery, depending on availability at checkout.",
        ),
        p(
          "Available payment methods, applicable charges, and order conditions will be displayed before purchase.",
        ),
        p(
          "Online payments are processed through the relevant payment provider. Kabuda does not ask customers to share their PINs, passwords, or OTPs through customer support.",
        ),
        p(
          "If a payment is debited but an order is not confirmed, customers should contact support with the transaction reference. Duplicate or failed transactions will be investigated and resolved as applicable.",
        ),
      ],
    },
  ],
};

export const policies = {
  privacy,
  terms,
  returnExchange,
  refundCancellation,
  shippingDelivery,
  grievance,
  payment,
} as const;

export type PolicyKey = keyof typeof policies;

/** Every policy, in the order they are listed in the footer. */
export const POLICY_ORDER: readonly PolicyKey[] = [
  "privacy",
  "terms",
  "returnExchange",
  "refundCancellation",
  "shippingDelivery",
  "grievance",
  "payment",
];

/* ------------------------------------------------------------------ */
/* Contact Us                                                          */
/* ------------------------------------------------------------------ */

export const contactCopy = {
  intro:
    "For order-related questions, product information, returns, exchanges, refunds, or other concerns, contact Kabuda through the official details below.",
  advice:
    "We recommend contacting customer support with your order number for faster assistance.",
};

/* ------------------------------------------------------------------ */
/* Tokens                                                              */
/* ------------------------------------------------------------------ */

export type PolicyVars = Record<string, string>;

/**
 * What the `{{tokens}}` in the policy text become.
 *
 * Support details are the store's settings. The Grievance Officer's are in
 * `src/lib/business.ts`, falling back to the support email and the business address where
 * the officer has no details of their own. An empty value stays empty so the page can leave
 * the line out.
 */
export function policyVars(
  settings: Pick<StoreSettings, "legalName" | "email" | "phone" | "address">,
): PolicyVars {
  return {
    legalName: settings.legalName.trim(),
    supportEmail: settings.email.trim(),
    supportPhone: settings.phone.trim(),
    address: settings.address.trim(),
    website: WEBSITE,
    officerName: grievanceOfficer.name,
    officerDesignation: grievanceOfficer.designation,
    officerEmail: grievanceOfficer.email || settings.email.trim(),
    officerPhone: grievanceOfficer.phone,
    officerAddress: grievanceOfficer.address || settings.address.trim(),
  };
}

const TOKEN = /\{\{(\w+)\}\}/g;

/** Replace every `{{token}}`. An unknown token becomes empty, never literal braces. */
export function fillTokens(text: string, vars: PolicyVars): string {
  return text.replace(TOKEN, (_match, name: string) => vars[name] ?? "");
}

/** Every token a piece of text uses. For tests. */
export function tokensIn(text: string): string[] {
  return [...text.matchAll(TOKEN)].map((match) => match[1]);
}

/**
 * A `kv` value that came out empty. `[](mailto:)` is what an empty link token leaves
 * behind, and it is empty for this purpose too.
 */
export function isBlankValue(filled: string): boolean {
  return filled.replace(/\[\]\(mailto:\)/g, "").trim() === "";
}

/** Link markup and bold removed, for places that want plain text (structured data). */
export function plainText(text: string): string {
  return text.replace(/\*\*(.+?)\*\*/g, "$1").replace(/\[([^\]]*)\]\([^)]*\)/g, "$1");
}
