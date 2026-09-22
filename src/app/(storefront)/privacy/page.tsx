import type { Metadata } from "next";
import Link from "next/link";
import { ContentPage, Prose } from "@/components/layout/content-page";
import { site } from "@/lib/config";

export const metadata: Metadata = {
  title: "Privacy policy",
  description: `How ${site.legalName} collects, uses and protects your personal data.`,
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <ContentPage
      eyebrow="Legal"
      title="Privacy policy"
      lede="What we collect, why we collect it, and how to make us delete it. Written to be read rather than to protect us."
      breadcrumbs={[{ label: "Home", href: "/" }, { label: "Privacy policy" }]}
      updated="1 July 2026"
    >
      <Prose>
        {/*
          This is template copy for a storefront build. Have it reviewed by a
          qualified lawyer in your jurisdiction before you take real orders — the
          disclosures required under UK GDPR, EU GDPR, CCPA and similar regimes
          differ by market.
        */}
        <p className="border-l-2 border-clay-300 pl-4 text-sm italic">
          Template text for this build. Have a qualified lawyer review it against the
          regulations in every market you sell into before going live.
        </p>

        <h2>Who we are</h2>
        <p>
          {site.legalName}, {site.address}, is the data controller for personal data
          collected through this website. You can reach our data protection contact at{" "}
          <a href={`mailto:${site.email}`}>{site.email}</a>.
        </p>

        <h2>What we collect</h2>
        <ul>
          <li>
            <strong>Order information</strong> — name, delivery and billing address, email
            address and phone number, collected so we can fulfil and support your order.
          </li>
          <li>
            <strong>Payment information</strong> — processed by our payment provider. Card
            numbers never reach our servers; we hold only the last four digits and the card
            network, which is what appears on your receipt.
          </li>
          <li>
            <strong>Account and preference data</strong> — saved addresses, saved items and
            your bag, stored in your browser and, if you create an account, against it.
          </li>
          <li>
            <strong>Marketing consent</strong> — your email address and the fact that you
            opted in, if you chose to join our list.
          </li>
          <li>
            <strong>Technical data</strong> — IP address, device and browser type, and pages
            visited, used to keep the site secure and to understand which pieces people are
            looking at.
          </li>
        </ul>

        <h2>Why we process it</h2>
        <ul>
          <li>
            <strong>To perform our contract with you</strong> — taking payment, shipping your
            order, handling returns and repairs.
          </li>
          <li>
            <strong>Legitimate interests</strong> — fraud prevention, site security, and
            improving the store based on aggregate usage.
          </li>
          <li>
            <strong>Consent</strong> — marketing email and any non-essential cookies. You can
            withdraw consent at any time, from any email we send or by contacting us.
          </li>
          <li>
            <strong>Legal obligation</strong> — retaining transaction records for tax and
            accounting purposes.
          </li>
        </ul>

        <h2>How long we keep it</h2>
        <p>
          Order records are retained for seven years to meet tax obligations. Marketing
          consent is retained until you withdraw it. Browser-stored data — your bag, saved
          items, saved addresses — lives on your device until you clear it, and never leaves
          your browser unless you place an order.
        </p>

        <h2>Who we share it with</h2>
        <p>
          Only processors that are necessary to run the shop: our payment provider, our
          couriers, our email platform and our hosting provider. Each is bound by a data
          processing agreement. We do not sell personal data, and we do not share it with
          advertising networks for cross-site tracking.
        </p>

        <h2>Your rights</h2>
        <ul>
          <li>Access a copy of the personal data we hold about you.</li>
          <li>Correct anything that is inaccurate.</li>
          <li>Have your data deleted, where we are not required to keep it.</li>
          <li>Object to processing based on legitimate interests.</li>
          <li>Withdraw marketing consent at any time.</li>
          <li>Receive your data in a portable format.</li>
        </ul>
        <p>
          Email <a href={`mailto:${site.email}`}>{site.email}</a> and we will respond within
          one month. If you are unhappy with our response you can complain to your national
          data protection authority.
        </p>

        <h2>Cookies</h2>
        <p>
          We use strictly necessary cookies to keep your session and bag working. Anything
          analytical or marketing-related requires your consent, and the store functions
          fully without it.
        </p>

        <h2>Changes</h2>
        <p>
          If we change this policy materially we will say so on this page and, where the
          change affects how we use your data, tell you by email. See also our{" "}
          <Link href="/terms">terms of sale</Link>.
        </p>
      </Prose>
    </ContentPage>
  );
}
