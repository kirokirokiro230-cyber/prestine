import type { Metadata } from "next";
import Link from "next/link";
import { ContentPage, Prose } from "@/components/layout/content-page";
import { storeSettings } from "@/lib/catalog";
import { createMoneyFormatter } from "@/lib/format";

export async function generateMetadata(): Promise<Metadata> {
  const settings = await storeSettings();

  return {
    title: "Terms of sale",
    description: `The terms on which ${settings.legalName} sells through this website.`,
    alternates: { canonical: "/terms" },
  };
}

export default async function TermsPage() {
  const settings = await storeSettings();
  const money = createMoneyFormatter(settings.currency, settings.locale);

  return (
    <ContentPage
      eyebrow="Legal"
      title="Terms of sale"
      lede="The terms that apply when you buy from us. Plain English, no clauses designed to be skipped."
      breadcrumbs={[{ label: "Home", href: "/" }, { label: "Terms of sale" }]}
      updated="1 July 2026"
    >
      <Prose>
        <p className="border-l-2 border-clay-300 pl-4 text-sm italic">
          Template text for this build. Have a qualified lawyer review it before you take
          real orders — consumer contract law differs by market.
        </p>

        <h2>1. Who you are contracting with</h2>
        <p>
          Purchases made through this website are a contract with {settings.legalName},
          registered at {settings.address}. Contact us at{" "}
          <a href={`mailto:${settings.email}`}>{settings.email}</a> or {settings.phone}.
        </p>

        <h2>2. Placing an order</h2>
        <p>
          Adding an item to your bag does not reserve it. Your order is an offer to buy,
          which we accept when we send a confirmation email. If a piece sells out between
          your order and our acceptance we will tell you and refund that line in full.
        </p>

        <h2>3. Prices and payment</h2>
        <ul>
          <li>
            Prices are shown in {settings.currency} and include applicable sales tax where it is
            charged.
          </li>
          <li>
            Duties and import taxes for international orders are calculated and charged at
            checkout, so nothing is owed on delivery.
          </li>
          <li>
            Payment is taken at the point of order. If payment fails, the order is not
            accepted.
          </li>
          <li>
            If we list a price incorrectly we will contact you before dispatch and you may
            confirm at the correct price or cancel for a full refund.
          </li>
        </ul>

        <h2>4. Delivery</h2>
        <p>
          Standard delivery is complimentary on orders over{" "}
          {money(settings.freeShippingThreshold)}. Delivery estimates are estimates, not
          guarantees. Risk passes to you on delivery. If a parcel does not arrive, tell us
          and we will investigate with the courier and replace or refund it.
        </p>

        <h2>5. Returns and cancellation</h2>
        <p>
          You may return anything unworn with tags attached within {settings.returnWindowDays}{" "}
          days of delivery, free of charge. This is in addition to any statutory right of
          cancellation you have under consumer law. Archive sale pieces are final sale.
          Full detail is on our <Link href="/shipping-returns">shipping and returns</Link>{" "}
          page.
        </p>

        <h2>6. Faulty goods and our repair commitment</h2>
        <p>
          Nothing in these terms limits your statutory rights in respect of goods that are
          faulty or not as described. Separately, and as a commercial commitment rather than
          a legal one, we repair anything we made for as long as you own it, free of charge.
        </p>

        <h2>7. Product descriptions</h2>
        <p>
          We describe fabrics, weights and construction as accurately as we can. Natural
          fibres vary between production runs, and colour reproduction varies between
          screens. Slight variation is not a fault, but if a piece is not what you expected,
          return it.
        </p>

        <h2>8. Promotional codes</h2>
        <p>
          Codes apply to the merchandise subtotal, cannot be combined unless we say so, have
          no cash value, and may be withdrawn at any time. Codes do not apply to archive sale
          pieces.
        </p>

        <h2>9. Acceptable use</h2>
        <p>
          You may not use this site to attempt unauthorised access, to scrape at a rate that
          degrades service for others, or to resell our products as authorised stock without
          a written wholesale agreement.
        </p>

        <h2>10. Liability</h2>
        <p>
          We do not exclude liability for death or personal injury caused by our negligence,
          for fraud, or for anything else that cannot lawfully be excluded. Subject to that,
          our liability in connection with an order is limited to the amount you paid for it.
        </p>

        <h2>11. Governing law</h2>
        <p>
          These terms are governed by the law of England and Wales, and the courts of England
          and Wales have non-exclusive jurisdiction. If you are a consumer resident
          elsewhere, you keep the protection of your local mandatory consumer law.
        </p>

        <h2>12. Changes</h2>
        <p>
          We may update these terms. The version that applies to your order is the one
          published when you placed it. See also our{" "}
          <Link href="/privacy">privacy policy</Link>.
        </p>
      </Prose>
    </ContentPage>
  );
}
