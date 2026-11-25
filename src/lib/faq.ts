import { RETURNS_EMAIL } from "./business";

/**
 * The FAQ, as data. Six sections, 71 questions.
 *
 * ## Answers
 *
 * A plain string. A blank line starts a new paragraph, and a paragraph whose every line
 * begins with `- ` is a bulleted list. `**bold**` and `[label](href)` work as in
 * `src/lib/policies.ts` (the renderer is shared). Every other detail of wording is the
 * published text and should be changed there, deliberately, rather than tidied.
 */

export interface FaqItem {
  id: string;
  question: string;
  answer: string;
}

export interface FaqSection {
  id: string;
  heading: string;
  items: FaqItem[];
}

const RETURNS_MAILTO = `[${RETURNS_EMAIL}](mailto:${RETURNS_EMAIL})`;
const PORTAL = "[Return & Exchange Portal](/account/orders)";

export const faqSections: FaqSection[] = [
  /* ---------------------------------------------------------------- */
  {
    id: "orders-payment",
    heading: "Orders & Payment",
    items: [
      {
        id: "orders-place-order",
        question: "How can I place an order on KABUDA?",
        answer:
          "You can browse our website, select your preferred product, choose the correct size, and add it to your cart. Proceed to checkout, enter your shipping details, select your preferred payment method, and confirm your order.",
      },
      {
        id: "orders-account",
        question: "Do I need to create an account to place an order?",
        answer:
          "You can browse our website and explore our products without creating an account. However, creating an account is mandatory to place an order on KABUDA.",
      },
      {
        id: "orders-confirmation",
        question: "How will I know if my order has been placed successfully?",
        answer:
          "Once your order is successfully placed, you will receive an order confirmation through the contact details provided during checkout.",
      },
      {
        id: "orders-payment-methods",
        question: "What payment methods are available on KABUDA?",
        answer:
          "We may offer multiple payment options, including UPI, debit cards, credit cards, net banking, digital wallets, and Cash on Delivery (COD), depending on availability at checkout.",
      },
      {
        id: "orders-cod",
        question: "Is Cash on Delivery (COD) available?",
        answer:
          "Yes, Cash on Delivery may be available for selected locations and orders. COD availability depends on your delivery pincode and will be displayed during checkout.",
      },
      {
        id: "orders-cod-charges",
        question: "Are there any additional charges for COD orders?",
        answer:
          "Any applicable COD charges will be displayed separately at checkout before you confirm your order.",
      },
      {
        id: "orders-taxes",
        question: "Are taxes included in the product prices?",
        answer:
          "Yes. All product prices displayed on the KABUDA website are inclusive of applicable taxes. Delivery charges, if applicable, will be shown separately at checkout.",
      },
      {
        id: "orders-multiple-products",
        question: "Can I place multiple products in a single order?",
        answer:
          "Yes. You can add multiple products to your shopping bag and complete your purchase in a single order.",
      },
      {
        id: "orders-someone-else",
        question: "Can I place an order for someone else and enter a different delivery address?",
        answer:
          "Yes. You can enter a delivery address different from your billing address during checkout, provided the option is available.",
      },
      {
        id: "orders-payment-fails",
        question: "What should I do if my payment fails?",
        answer:
          "If your payment fails or the amount is deducted without successful order confirmation, please contact our customer support team with your transaction reference. We will investigate the issue and arrange an appropriate resolution.",
      },
      {
        id: "orders-cancel",
        question: "Can I cancel my order after placing it?",
        answer:
          "You can request order cancellation before your order has been dispatched by contacting our customer support team. Once the order has been dispatched, cancellation requests will be handled under our Return Policy, subject to applicable consumer rights.",
      },
      {
        id: "orders-modify",
        question: "Can I modify my order after placing it?",
        answer:
          "If you need to make changes to your order, contact our customer support team as soon as possible. Any changes will depend on the order's processing and dispatch status and cannot be guaranteed.",
      },
      {
        id: "orders-add-product",
        question: "Can I add another product to my order after placing it?",
        answer:
          "Once an order has been placed, adding additional products may not be possible. Please contact our customer support team as soon as possible. Any modification will depend on the order's processing status.",
      },
      {
        id: "orders-duplicate",
        question: "What should I do if I accidentally place the same order twice?",
        answer:
          "If you accidentally place duplicate orders, please contact our customer support team immediately with both order numbers. We will review your request based on the order status.",
      },
    ],
  },

  /* ---------------------------------------------------------------- */
  {
    id: "shipping-tracking",
    heading: "Shipping & Tracking",
    items: [
      {
        id: "shipping-india",
        question: "Does KABUDA deliver across India?",
        answer:
          "KABUDA aims to serve customers across India. Delivery availability depends on the serviceability of your pincode. You can check whether your location is serviceable during checkout.",
      },
      {
        id: "shipping-time",
        question: "How long will it take for my order to be delivered?",
        answer:
          "Orders are generally processed within 1–3 business days after confirmation. Once dispatched, delivery generally takes 3–7 business days, depending on your location.\n\nRemote locations may require additional delivery time.",
      },
      {
        id: "shipping-charges",
        question: "What are the shipping charges on KABUDA?",
        answer:
          "Applicable shipping charges will be displayed at checkout before you complete your purchase. Any eligible free-shipping offer will also be reflected during checkout.",
      },
      {
        id: "shipping-track",
        question: "How can I track my order?",
        answer:
          "Once your order is dispatched, tracking details will be shared through the contact information provided during checkout, wherever tracking is available.\n\nYou can use these details to check your shipment status.",
      },
      {
        id: "shipping-change-address",
        question: "Can I change my shipping address after placing an order?",
        answer:
          "If you need to correct your shipping address, please contact our customer support team immediately. Address changes may depend on the processing and dispatch status of your order and cannot be guaranteed.",
      },
      {
        id: "shipping-change-after-dispatch",
        question: "Can I change my delivery address after my order has been dispatched?",
        answer:
          "Once an order has been dispatched, changing the delivery address may not be possible. Please contact our customer support team for assistance.",
      },
      {
        id: "shipping-delayed",
        question: "What should I do if my order is delayed?",
        answer:
          "If your order has not arrived within the estimated delivery timeframe, please contact our customer support team with your order number. We will check the shipment status with our delivery partner.",
      },
      {
        id: "shipping-undelivered",
        question: "What happens if my order is undelivered?",
        answer:
          "Incorrect address details, unsuccessful delivery attempts, or customer unavailability may result in delivery delays or failed delivery. Please ensure that your shipping address and contact details are accurate when placing an order.\n\nFor assistance, contact our customer support team.",
      },
      {
        id: "shipping-marked-delivered",
        question: "What should I do if my order shows as delivered but I haven't received it?",
        answer:
          "If your order is marked as delivered but you have not received it, please contact our customer support team with your order number. We will investigate the issue with our shipping partner.",
      },
      {
        id: "shipping-attempts",
        question: "How many delivery attempts will be made if I am unavailable?",
        answer:
          "Delivery attempts are managed by our shipping partners. If a delivery attempt is unsuccessful, please contact our customer support team for assistance.",
      },
      {
        id: "shipping-together",
        question: "Will all products in my order be delivered together?",
        answer:
          "We aim to deliver your order together. However, depending on product availability and shipping arrangements, items may be delivered separately.",
      },
      {
        id: "shipping-collect",
        question: "Can I collect my order directly from a courier facility?",
        answer:
          "Orders are generally delivered to the shipping address provided during checkout. Any alternative delivery arrangement depends on the shipping partner.",
      },
      {
        id: "shipping-damaged",
        question: "What should I do if my order arrives damaged?",
        answer:
          "If you receive a damaged or defective product, contact our customer support team with your order number and clear photographs of the product. Your request will be reviewed under our [Return & Exchange Policy](/return-exchange-policy).",
      },
      {
        id: "shipping-international",
        question: "Does KABUDA offer international shipping?",
        answer:
          "Our current [Shipping Policy](/shipping-delivery-policy) covers deliveries within India. Please contact our customer support team for information about international shipping availability.",
      },
    ],
  },

  /* ---------------------------------------------------------------- */
  {
    id: "products-sizing",
    heading: "Products & Sizing",
    items: [
      {
        id: "sizing-choose",
        question: "How do I choose the correct size?",
        answer:
          "Every product may have its own size and fit specifications. We recommend checking the size chart available on the respective product page before placing your order.\n\nIf you are unsure about your size, contact our customer support team for assistance.",
      },
      {
        id: "sizing-between",
        question: "What should I do if I am confused between two sizes?",
        answer:
          "We recommend comparing your body measurements with the product's size chart. You can also contact our customer support team before placing your order for guidance.",
      },
      {
        id: "sizing-accurate",
        question: "Are the product measurements accurate?",
        answer:
          "We make reasonable efforts to provide accurate product measurements and size information. Slight variations may occur due to manufacturing and measurement processes.",
      },
      {
        id: "sizing-care",
        question: "How should I wash and care for my KABUDA products?",
        answer:
          "We recommend following the washing and care instructions mentioned on the product's care label. Proper care can help maintain the product's appearance, fabric quality, and durability.",
      },
      {
        id: "sizing-fabric-fit",
        question: "Will the fabric and fit be the same for every product?",
        answer:
          "No. Fabric composition, texture, construction, and fit may vary across different products. Please refer to the respective product description for detailed information.",
      },
      {
        id: "sizing-images",
        question: "Are the product images an exact representation of the actual product?",
        answer:
          "We make reasonable efforts to display products as accurately as possible. However, slight variations in colour and appearance may occur due to lighting, photography, and individual screen settings.",
      },
      {
        id: "sizing-composition",
        question: "Where can I find the fabric composition and product details?",
        answer:
          "You can find available information about fabric composition, fit, product features, and other specifications on the respective product page.",
      },
      {
        id: "sizing-availability",
        question: "How can I know if a product is available in my size?",
        answer:
          "You can check the available sizes directly on the respective product page. Product availability may change depending on stock levels.",
      },
    ],
  },

  /* ---------------------------------------------------------------- */
  {
    id: "returns-exchange-refund",
    heading: "Returns, Exchange & Refund",
    items: [
      {
        id: "returns-policy",
        question: "What is KABUDA's Return Policy?",
        answer:
          "At KABUDA, you can request a return within 7 calendar days of receiving your order, even if you simply do not like the product.\n\nTo qualify for a return, the product must be unused, unworn, unwashed, and undamaged, with its original tags, labels, and packaging, where applicable.",
      },
      {
        id: "returns-request",
        question: "How can I request a return?",
        answer: `You can submit a return request through our ${PORTAL} or email us at ${RETURNS_MAILTO} within 7 calendar days of delivery.\n\nPlease provide your order number and the reason for your return. Include clear photographs wherever relevant.\n\nWait for our instructions before shipping the product back.`,
      },
      {
        id: "returns-exchange-policy",
        question: "What is KABUDA's Exchange Policy?",
        answer:
          "You can request an exchange within 7 calendar days of delivery for the following reasons:\n\n- Size or fit issues.\n- Incorrect product delivered.\n- Damaged or defective product.\n- Product materially different from its advertised description.\n\nAll exchange requests are subject to product availability and product inspection.",
      },
      {
        id: "returns-exchange-free",
        question: "Is exchange free on KABUDA?",
        answer:
          "Yes. Approved exchanges are completely free of cost. We will not deduct any shipping or exchange charges for an approved exchange request.",
      },
      {
        id: "returns-exchange-size",
        question: "Can I exchange my product for a different size?",
        answer:
          "Yes. You can request an exchange for size or fit issues within 7 calendar days of delivery, subject to product availability and our exchange eligibility conditions.",
      },
      {
        id: "returns-exchange-colour",
        question: "Can I exchange my product for a different colour or design?",
        answer:
          "Our current Exchange Policy covers size or fit issues, incorrect products, damaged or defective products, and products materially different from their advertised descriptions.\n\nExchanges for a different colour or design are not currently specified as an eligible reason.",
      },
      {
        id: "returns-exchange-conditions",
        question: "What are the conditions for an exchange?",
        answer:
          "The product must be unused, unworn, unwashed, unaltered, and undamaged, with its original tags and labels intact, wherever applicable.\n\nAll returned products will undergo inspection before exchange approval.",
      },
      {
        id: "returns-exchange-rejected",
        question: "What happens if my exchange request is rejected?",
        answer:
          "If your exchange request is rejected after inspection because the product does not meet our eligibility conditions, the same product will be returned to you.\n\nApplicable return shipping charges may be payable by you. These charges will be communicated before the product is shipped back.\n\nThis does not apply where you are entitled to a free remedy under applicable law.",
      },
      {
        id: "returns-one-product",
        question: "Can I return only one product from a multiple-product order?",
        answer:
          "You can contact our customer support team to request a return for an individual product. The request will be reviewed according to our Return Policy.",
      },
      {
        id: "returns-dont-like",
        question: "Can I return a product if I simply don't like it?",
        answer:
          "Yes. KABUDA allows returns within 7 calendar days of delivery, even if you are not satisfied with the product or simply do not like it.\n\nThe product must meet our return eligibility conditions.",
      },
      {
        id: "returns-discounted",
        question: "Can I return a product purchased on discount?",
        answer:
          "Yes. Discounted products are not excluded from returns under our policy. You can request a return within 7 calendar days of delivery, subject to the same return eligibility conditions.",
      },
      {
        id: "returns-no-tags",
        question: "Can I return a product without its original tags?",
        answer:
          "Products must have their original tags, labels, and packaging, where applicable, to qualify for a return. Products missing essential tags may not be eligible, except where applicable law provides otherwise.",
      },
      {
        id: "returns-used-washed",
        question: "Can I return a product that has been used or washed?",
        answer:
          "No. Products must be unused, unworn, unwashed, unaltered, and undamaged to qualify for a return, subject to applicable consumer rights.",
      },
      {
        id: "returns-wrong-product",
        question: "What should I do if I receive the wrong product?",
        answer:
          "If you receive a product different from the one you ordered, you can request an exchange within 7 calendar days of delivery.\n\nPlease contact our customer support team with your order number and clear photographs of the product received.",
      },
      {
        id: "returns-defective",
        question: "What should I do if I receive a defective product?",
        answer:
          "If you receive a damaged or defective product, contact our customer support team within 7 calendar days of delivery with your order number and clear photographs.\n\nYour request will be reviewed under our [Return & Exchange Policy](/return-exchange-policy).",
      },
      {
        id: "returns-refund-when",
        question: "When will I receive my refund after returning a product?",
        answer:
          "Once we receive and inspect your returned product, we will notify you of the outcome.\n\nApproved refunds will be initiated within 5–7 business days after approval. The time taken for the refund to reflect in your account depends on your bank or payment provider.",
      },
      {
        id: "returns-full-refund",
        question: "Will I receive a full refund if I return a product?",
        answer:
          "For approved returns, the applicable return shipping charges will be deducted from your refund.\n\nThe original shipping charges paid at the time of purchase are also non-refundable, except where required by applicable law.",
      },
      {
        id: "returns-shipping-refundable",
        question: "Are the shipping charges refundable?",
        answer:
          "Original shipping charges paid during purchase are non-refundable, except where required by applicable law.\n\nFor approved returns, applicable return shipping charges will also be deducted from the refund amount.",
      },
      {
        id: "returns-refund-where",
        question: "Where will I receive my refund?",
        answer:
          "Refunds will generally be issued to the original payment method.\n\nFor Cash on Delivery orders, you may be asked to provide an appropriate bank account or other permitted refund details through a secure channel.",
      },
      {
        id: "returns-refund-how-long",
        question: "How long does it take to process a refund?",
        answer:
          "Approved refunds are initiated within 5–7 business days after approval. However, the time required for the amount to appear in your account depends on your bank or payment provider.",
      },
      {
        id: "returns-missed-deadline",
        question: "What happens if I miss a return or exchange request deadline?",
        answer:
          "Return and exchange requests must be submitted within 7 calendar days of delivery. Requests submitted after this period may not qualify under our standard policy, except where applicable law provides otherwise.",
      },
    ],
  },

  /* ---------------------------------------------------------------- */
  {
    id: "miscellaneous",
    heading: "Miscellaneous",
    items: [
      {
        id: "misc-contact",
        question: "How can I contact KABUDA customer support?",
        answer: `For any questions regarding orders, payments, products, shipping, returns, exchanges, or refunds, you can contact our customer support team through our official contact channels.\n\nFor return-related requests, you can also email us at ${RETURNS_MAILTO}.`,
      },
      {
        id: "misc-gift",
        question: "Does KABUDA offer gift wrapping or gift packaging?",
        answer:
          "Gift wrapping and special gift packaging availability will be communicated on our website whenever such services are offered.",
      },
      {
        id: "misc-bulk",
        question: "Can I purchase KABUDA products in bulk?",
        answer:
          "For bulk purchase or business-related enquiries, please contact our team through our official contact channels.",
      },
      {
        id: "misc-updates",
        question: "How can I stay updated about new collections and product launches?",
        answer:
          "You can follow KABUDA on our official social media channels and visit our website to stay updated about new collections, product launches, and brand announcements.",
      },
      {
        id: "misc-promo-emails",
        question: "Will I receive promotional emails from KABUDA?",
        answer:
          "KABUDA may send promotional communications and updates where permitted and, where required, with your consent.",
      },
      {
        id: "misc-report-problem",
        question: "How can I report a problem with a product or website?",
        answer:
          "You can contact our customer support team with a description of the issue, relevant photographs or screenshots, and your order number, if applicable.",
      },
      {
        id: "misc-complaint",
        question: "How can I raise a complaint with KABUDA?",
        answer:
          "You can contact our customer support team with your order number, contact information, and a clear description of your complaint.\n\nWe aim to acknowledge consumer complaints within 48 hours and address them within one month from the date of receipt, in accordance with applicable law.",
      },
    ],
  },

  /* ---------------------------------------------------------------- */
  {
    id: "privacy-policies",
    heading: "Privacy & Policies",
    items: [
      {
        id: "privacy-read",
        question: "Where can I read KABUDA's Privacy Policy?",
        answer:
          "You can visit the [Privacy Policy](/privacy) section on our website to understand how we collect, use, store, and protect your personal information.",
      },
      {
        id: "privacy-protect",
        question: "How does KABUDA protect my personal information?",
        answer:
          "We respect your privacy and take reasonable measures to protect your personal information against unauthorized access, loss, misuse, or disclosure.\n\nFor more information, please refer to our [Privacy Policy](/privacy).",
      },
      {
        id: "privacy-sharing",
        question: "Does KABUDA share my personal information with other companies?",
        answer:
          "We may share relevant information with trusted service providers such as payment processors, shipping partners, website hosting providers, analytics services, and customer support providers when necessary for business operations or as permitted by law.\n\nWe do not sell your personal information to third parties.",
      },
      {
        id: "privacy-cookies",
        question: "Does KABUDA use cookies on its website?",
        answer:
          "Yes. Our website may use cookies and similar technologies to maintain website functionality, understand website traffic, and measure advertising performance.",
      },
      {
        id: "privacy-access",
        question: "Can I request access to or deletion of my personal information?",
        answer:
          "Subject to applicable law, you may request access to, correction of, or deletion of your personal information. You may also withdraw consent wherever applicable.\n\nCertain records may need to be retained for legal, tax, accounting, or dispute-resolution purposes.",
      },
      {
        id: "privacy-updates",
        question: "What happens if KABUDA updates its policies?",
        answer:
          "KABUDA may update its policies from time to time. Any revised policies will be published on the relevant pages of our website.",
      },
      {
        id: "privacy-contact",
        question: "How can I contact KABUDA regarding privacy-related concerns?",
        answer:
          "For privacy-related questions or requests, please contact us through our official customer support email.",
      },
    ],
  },
];

/* ------------------------------------------------------------------ */
/* Answer text                                                         */
/* ------------------------------------------------------------------ */

export type AnswerBlock =
  | { type: "p"; text: string }
  | { type: "ul"; items: string[] };

/**
 * An answer split into paragraphs and bullet lists.
 *
 * A blank line separates paragraphs. A paragraph in which every line starts with `- ` is a
 * list. A paragraph that mixes the two is kept as text, with its `- ` untouched, rather than
 * guessed at.
 */
export function answerBlocks(answer: string): AnswerBlock[] {
  return answer
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph): AnswerBlock => {
      const lines = paragraph.split("\n").map((line) => line.trim());

      if (lines.length > 0 && lines.every((line) => line.startsWith("- "))) {
        return { type: "ul", items: lines.map((line) => line.slice(2).trim()) };
      }

      return { type: "p", text: lines.join(" ") };
    });
}
