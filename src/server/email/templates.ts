import type { EmailTemplate, Order, StoreSettings } from "@/lib/types";
import { addressName } from "@/lib/format";

/**
 * Turning merchant-written copy into a sendable message.
 *
 * ## Why the merchant does not write HTML
 *
 * A subject line, a heading and some paragraphs. That is the whole editable surface. The
 * table scaffolding, the inlined styles and the plain-text alternative are generated
 * here, because HTML email is a genuinely hostile target — Outlook renders with Word's
 * engine, Gmail strips `<style>` blocks, and a stray unclosed tag produces a blank white
 * rectangle rather than an error. Handing a merchant a rich-text box means eventually
 * discovering that three weeks of order confirmations were unreadable in Outlook.
 *
 * ## Escaping
 *
 * Everything substituted into HTML goes through `escapeHtml` first, without exception.
 * Customer names, addresses and product names are attacker-controlled in the sense that
 * matters: a shopper can type whatever they like into the checkout, and their own
 * confirmation email is the first place it comes back out. The escape happens at
 * substitution time rather than at storage time, so the stored value stays the value.
 *
 * ## Both parts, always
 *
 * Every message carries a `text/plain` alternative built from the same tokens. Not for
 * completeness — a `multipart/alternative` with no text part is one of the strongest spam
 * signals there is, and transactional email that lands in spam may as well not be sent.
 */

/* ------------------------------------------------------------------ */
/* Brand palette                                                       */
/* ------------------------------------------------------------------ */

/**
 * The same warm ink / bone / clay palette the storefront is built on
 * (`src/app/globals.css`), spelled out as literal hex rather than referenced, because an
 * email client reads none of the app's CSS variables. Kept in one place so the shell,
 * the item table and the CTA button can never drift out of step with each other.
 */
const INK_950 = "#0d0c0a";
const INK_900 = "#171512";
const INK_500 = "#605c54";
const BONE_100 = "#fbf9f6";
const BONE_200 = "#f5f1ea";
const CLAY_600 = "#85543c";
const CLAY_700 = "#6a4331";
/** A hairline rule, one step warmer than pure grey — matches `--sem-line`. */
const HAIRLINE = "#ece6db";

/** Matches `--font-sans` / `--font-display` in globals.css, minus the variable fonts. */
const SANS = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";
const SERIF = "'Cormorant Garamond','Times New Roman',Georgia,serif";

/* ------------------------------------------------------------------ */
/* Tokens                                                             */
/* ------------------------------------------------------------------ */

/**
 * What a `{{token}}` may resolve to.
 *
 * Two shapes per token because the two renderings genuinely differ: `itemLines` is a
 * `<table>` in HTML and an indented list in text, and `orderUrl` is a link in one and a
 * bare URL in the other. Collapsing them would mean showing raw markup in the text part.
 */
interface TokenValue {
  /** Already-escaped HTML, or a plain string that will be escaped. */
  html: string;
  text: string;
  /** Set when the value is HTML that must not be escaped again. */
  raw?: boolean;
}

/** Tokens a merchant can use, with a one-line description for the admin panel. */
export const EMAIL_TOKENS: Array<{ token: string; describes: string }> = [
  { token: "{{storeName}}", describes: "Your store name" },
  { token: "{{orderId}}", describes: "Order reference, e.g. PR-260830-0007" },
  { token: "{{customerName}}", describes: "Full name from the shipping address" },
  { token: "{{customerFirstName}}", describes: "First word of their name" },
  { token: "{{orderTotal}}", describes: "Total paid, formatted" },
  { token: "{{itemLines}}", describes: "The items, as a list" },
  { token: "{{shippingAddress}}", describes: "Delivery address, multi-line" },
  { token: "{{deliveryEstimate}}", describes: "e.g. 3–5 business days" },
  { token: "{{returnWindowDays}}", describes: "Your returns window in days" },
  { token: "{{trackingBlock}}", describes: "Carrier and tracking number, if known" },
  { token: "{{cancellationReason}}", describes: "Why it was cancelled, if given" },
  { token: "{{orderUrl}}", describes: "Link to look the order up" },
];

/**
 * The shipping address over several lines.
 *
 * Not `formatAddress` from `lib/format`, which joins with commas for a table cell or a
 * single line of admin UI. An email has the room to set an address the way an address is
 * written, and a postal block belongs on its own line. Empty parts are dropped, so a
 * legacy order without a region does not leave a blank line in the middle.
 */
function addressBlock(address: Order["shippingAddress"]): string {
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
    .join("\n");
}

/** Money without `Intl` surprises: the same formatter the storefront uses. */
function money(minor: number, settings: StoreSettings): string {
  return new Intl.NumberFormat(settings.locale, {
    style: "currency",
    currency: settings.currency,
  }).format(minor / 100);
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Where a customer looks an order up.
 *
 * Built from `settings.url` rather than a request header, because this runs from a
 * background send where there is no request to read. A store that has not set its public
 * URL gets a relative path, which is wrong in an email but visibly wrong rather than
 * pointing at `localhost:3000` for a real customer.
 */
function orderUrl(order: Order, settings: StoreSettings): string {
  const origin = settings.url.trim().replace(/\/+$/, "");
  const path = `/account/orders?order=${encodeURIComponent(order.id)}`;
  return origin ? `${origin}${path}` : path;
}

function itemLines(order: Order, settings: StoreSettings): TokenValue {
  const rows = order.lines.map((line) => {
    const label = `${line.name} — ${line.colorName}, ${line.size}`;
    const amount = money(line.unitPrice * line.quantity, settings);
    return {
      label,
      quantity: line.quantity,
      amount,
    };
  });

  const html = rows
    .map(
      (row, index) => `<tr>
  <td style="padding:14px 0;${index > 0 ? "border-top:1px solid #ece6db;" : ""}font-size:14px;line-height:1.5;color:${INK_900};font-family:${SANS};">
    <span style="font-weight:600;">${escapeHtml(row.label)}</span><br />
    <span style="color:${INK_500};font-size:13px;">Qty ${row.quantity}</span>
  </td>
  <td style="padding:14px 0;${index > 0 ? "border-top:1px solid #ece6db;" : ""}font-size:14px;color:${INK_900};font-family:${SANS};text-align:right;white-space:nowrap;vertical-align:top;">
    ${escapeHtml(row.amount)}
  </td>
</tr>`,
    )
    .join("");

  return {
    html: `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;margin:4px 0;">${html}</table>`,
    text: rows
      .map((row) => `  · ${row.label} × ${row.quantity} — ${row.amount}`)
      .join("\n"),
    raw: true,
  };
}

/**
 * Tracking, or nothing at all.
 *
 * An empty string when there is no tracking number, so a template that includes the token
 * does not render "Tracking: undefined". The blank paragraph it leaves behind is stripped
 * by the paragraph splitter.
 */
function trackingBlock(order: Order): TokenValue {
  if (!order.trackingNumber) {
    return order.carrier
      ? { html: `Sent with ${escapeHtml(order.carrier)}.`, text: `Sent with ${order.carrier}.` }
      : { html: "", text: "" };
  }

  const carrier = order.carrier ? `${order.carrier} ` : "";
  const line = `${carrier}tracking: ${order.trackingNumber}`;
  return { html: escapeHtml(line), text: line, raw: true };
}

function tokensFor(order: Order, settings: StoreSettings): Record<string, TokenValue> {
  const name = addressName(order.shippingAddress);
  const plain = (value: string): TokenValue => ({ html: escapeHtml(value), text: value, raw: true });

  return {
    storeName: plain(settings.name),
    orderId: plain(order.id),
    customerName: plain(name),
    // Falls back to the whole name rather than to an empty greeting.
    customerFirstName: plain(name.split(/\s+/)[0] || name),
    orderTotal: plain(money(order.totals.total, settings)),
    itemLines: itemLines(order, settings),
    shippingAddress: plain(addressBlock(order.shippingAddress)),
    deliveryEstimate: plain(
      `${settings.deliveryDaysMin}–${settings.deliveryDaysMax} business days`,
    ),
    returnWindowDays: plain(String(settings.returnWindowDays)),
    trackingBlock: trackingBlock(order),
    cancellationReason: order.cancellationReason
      ? plain(`Reason given: ${order.cancellationReason}`)
      : { html: "", text: "" },
    orderUrl: plain(orderUrl(order, settings)),
  };
}

/**
 * Substitute `{{tokens}}`.
 *
 * Unknown tokens are left verbatim rather than blanked. A merchant who typos
 * `{{ordrId}}` should see `{{ordrId}}` in the preview and fix it; silently emitting
 * nothing would ship an email with a hole in the middle of a sentence.
 */
function substitute(
  source: string,
  tokens: Record<string, TokenValue>,
  mode: "html" | "text",
): string {
  return source.replace(/\{\{(\w+)\}\}/g, (whole, name: string) => {
    const value = tokens[name];
    if (!value) return whole;
    if (mode === "text") return value.text;
    return value.raw ? value.html : escapeHtml(value.html);
  });
}

/* ------------------------------------------------------------------ */
/* Layout                                                            */
/* ------------------------------------------------------------------ */

/**
 * Blank-line-separated paragraphs.
 *
 * Empty entries are dropped, which is what lets an optional token like
 * `{{trackingBlock}}` sit on its own line in a template and simply vanish when it has
 * nothing to say, rather than leaving a gap.
 */
function paragraphs(body: string): string[] {
  return body
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);
}

/**
 * Wrap rendered copy in the message shell.
 *
 * Tables and inline styles throughout, and a 600px fixed width. This is not nostalgia —
 * it is the only construction that survives Outlook's Word rendering engine, and Gmail
 * discards `<style>` blocks so there is nowhere else for the CSS to live. `role="presentation"`
 * keeps assistive technology from announcing the layout scaffolding as a data table.
 */
/**
 * A rounded button, built the way HTML email buttons have to be built: a table cell with
 * a background colour and padding, not a styled `<a>`. Outlook (the desktop app, which
 * renders with Word rather than a browser engine) ignores padding and border-radius on
 * an anchor tag outright — a `<table>` cell survives it.
 */
function ctaButton(label: string, href: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:8px 0 4px;">
<tr><td style="border-radius:3px;background-color:${CLAY_600};">
<a href="${href}" style="display:inline-block;padding:13px 28px;font-family:${SANS};font-size:14px;font-weight:600;letter-spacing:0.02em;color:#ffffff;text-decoration:none;border-radius:3px;">${escapeHtml(label)}</a>
</td></tr>
</table>`;
}

/**
 * Wrap rendered copy in the message shell.
 *
 * Tables and inline styles throughout, and a 600px fixed width. This is not nostalgia —
 * it is the only construction that survives Outlook's Word rendering engine, and Gmail
 * discards `<style>` blocks so there is nowhere else for the CSS to live. `role="presentation"`
 * keeps assistive technology from announcing the layout scaffolding as a data table.
 *
 * The shell mirrors the storefront's own palette and type pairing — a dark ink header
 * band carrying the wordmark in the display serif, the same clay accent the site uses
 * for calls to action, and the bone off-white the shop is built on as the outer canvas —
 * so a customer's inbox reads as an extension of the site rather than a generic system
 * template with the brand name dropped in.
 */
function layout(options: {
  heading: string;
  bodyHtml: string;
  settings: StoreSettings;
  preheader: string;
  footerNote: string;
  /** Rendered as a button beneath the body when present. */
  cta?: { label: string; href: string };
}): string {
  const { heading, bodyHtml, settings, preheader, footerNote, cta } = options;
  const year = new Date().getFullYear();
  const storeUrl = settings.url.trim().replace(/\/+$/, "");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta name="color-scheme" content="light" />
<meta name="supported-color-schemes" content="light" />
<title>${escapeHtml(heading)}</title>
</head>
<body style="margin:0;padding:0;background-color:${BONE_200};font-family:${SANS};">
<!-- Inbox preview line. Hidden in the message body itself. -->
<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">${escapeHtml(preheader)}</div>
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;background-color:${BONE_200};">
<tr><td align="center" style="padding:40px 16px;">
<table role="presentation" cellpadding="0" cellspacing="0" width="600" style="border-collapse:collapse;max-width:600px;width:100%;">

<!-- Header band: the store name, set like a wordmark on the brand's dark ground. -->
<tr><td style="background-color:${INK_950};padding:30px 40px;border-radius:4px 4px 0 0;" align="center">
<p style="margin:0;font-family:${SERIF};font-size:24px;font-weight:600;letter-spacing:0.04em;color:${BONE_100};">${escapeHtml(settings.name)}</p>
</td></tr>

<!-- A hairline of clay under the header, the same accent the storefront uses throughout. -->
<tr><td style="background-color:${CLAY_600};height:3px;line-height:3px;font-size:0;">&nbsp;</td></tr>

<!-- Body card. -->
<tr><td style="background-color:#ffffff;padding:40px 40px 8px;">
<h1 style="margin:0 0 20px;font-family:${SERIF};font-size:30px;line-height:1.2;font-weight:600;color:${INK_900};">${escapeHtml(heading)}</h1>
${bodyHtml}
${cta ? ctaButton(cta.label, cta.href) : ""}
</td></tr>

<tr><td style="background-color:#ffffff;padding:8px 40px 36px;">
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
<tr><td style="border-top:1px solid ${HAIRLINE};font-size:0;line-height:0;">&nbsp;</td></tr>
</table>
</td></tr>

<!-- Footer. -->
<tr><td style="background-color:#ffffff;padding:0 40px 36px;border-radius:0 0 4px 4px;">
<p style="margin:0;font-size:12px;line-height:1.7;color:${INK_500};">
<span style="font-weight:600;color:${INK_900};">${escapeHtml(settings.legalName || settings.name)}</span>${settings.address ? `<br />${escapeHtml(settings.address)}` : ""}
</p>
<p style="margin:14px 0 0;font-size:11px;line-height:1.7;letter-spacing:0.01em;color:#9a9488;">
${escapeHtml(footerNote)}${storeUrl ? ` &nbsp;·&nbsp; <a href="${storeUrl}" style="color:${CLAY_700};text-decoration:none;">${escapeHtml(storeUrl.replace(/^https?:\/\//, ""))}</a>` : ""} &nbsp;·&nbsp; &copy; ${year}
</p>
</td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}

/* ------------------------------------------------------------------ */
/* Rendering                                                          */
/* ------------------------------------------------------------------ */

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

/**
 * Render a template against an order.
 *
 * Pure: no store reads, no clock beyond the footer year, no network. That is what makes
 * the admin preview and the real send provably the same thing — the preview calls this
 * with the same arguments the sender does, so what a merchant approves is what ships.
 */
export function renderOrderEmail(
  template: EmailTemplate,
  order: Order,
  settings: StoreSettings,
): RenderedEmail {
  const tokens = tokensFor(order, settings);

  const subject = substitute(template.subject, tokens, "text").trim();
  const heading = substitute(template.heading, tokens, "text").trim();

  const blocks = paragraphs(substitute(template.body, tokens, "html"));
  const bodyHtml = blocks
    .map((block) =>
      /*
       * A block that is already markup — `{{itemLines}}` expands to a table — is emitted
       * as-is. Wrapping a `<table>` in a `<p>` is invalid, and Outlook responds to invalid
       * nesting by dropping the content rather than by tolerating it.
       */
      block.startsWith("<table")
        ? block
        : `<p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:${INK_500};">${block.replace(/\n/g, "<br />")}</p>`,
    )
    .join("\n");

  const textBlocks = paragraphs(substitute(template.body, tokens, "text"));

  return {
    subject,
    html: layout({
      heading,
      bodyHtml,
      settings,
      // The first paragraph, as the inbox preview. Better than the subject repeated.
      preheader: textBlocks[0]?.slice(0, 140) ?? "",
      footerNote: "You are receiving this because you placed an order with us.",
      /*
       * Every order email gets the same button, pointed at the same place `{{orderUrl}}`
       * resolves to. A merchant who never types that token into the body still gets a
       * clear way back to the order, and one who does gets the link twice — once as a
       * button, once inline — which is a redundancy worth having in an inbox rather than
       * a bug worth removing.
       */
      cta: { label: "View your order", href: orderUrl(order, settings) },
    }),
    /*
     * `filter(Boolean)` rather than an explicit blank separator. Joining with `\n\n`
     * already puts one empty line between entries, so including a `""` of its own produces
     * three — and drops the heading entirely into whitespace when a template has none.
     */
    text: [heading, ...textBlocks].filter(Boolean).join("\n\n"),
  };
}

/**
 * Render a one-off message written in the admin panel.
 *
 * Shares the shell so an ad-hoc reply does not arrive looking like it came from a
 * different company. No token substitution: there is no order to resolve against, and
 * quietly leaving `{{orderId}}` unexpanded in a hand-written email is clearer than
 * inventing a value for it.
 */
export function renderCustomEmail(options: {
  subject: string;
  heading: string;
  body: string;
  settings: StoreSettings;
  /** Explains why the recipient received this message. */
  footerNote?: string;
}): RenderedEmail {
  const blocks = paragraphs(options.body);

  return {
    subject: options.subject.trim(),
    html: layout({
      heading: options.heading.trim() || options.subject.trim(),
      bodyHtml: blocks
        .map(
          (block) =>
            `<p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:${INK_500};">${escapeHtml(
              block,
            ).replace(/\n/g, "<br />")}</p>`,
        )
        .join("\n"),
      settings: options.settings,
      preheader: blocks[0]?.slice(0, 140) ?? "",
      footerNote:
        options.footerNote ?? `This message was sent by ${options.settings.name}.`,
    }),
    text: [options.heading.trim(), ...blocks].filter(Boolean).join("\n\n"),
  };
}
