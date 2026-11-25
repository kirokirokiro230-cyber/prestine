import type { Metadata } from "next";
import {
  Buildings,
  EnvelopeSimple,
  Globe,
  MapPin,
  Phone,
} from "@phosphor-icons/react/dist/ssr";
import { ContactForm } from "@/components/contact/contact-form";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { WEBSITE } from "@/lib/business";
import { storeSettings } from "@/lib/catalog";
import { contactCopy } from "@/lib/policies";

export const metadata: Metadata = {
  title: "Contact Us",
  description:
    "Contact Kabuda about orders, product information, returns, exchanges or refunds. Keep your order number ready for faster help.",
  alternates: { canonical: "/contact" },
};

export default async function ContactPage() {
  const settings = await storeSettings();

  /*
   * The details come from Admin → Settings, so they are the same ones the footer and the
   * emails use. A detail that is empty is left out rather than shown as a blank row.
   */
  const channels = [
    {
      icon: Globe,
      title: "Website",
      body: WEBSITE.replace(/^https:\/\//, ""),
      href: WEBSITE,
    },
    {
      icon: EnvelopeSimple,
      title: "Email",
      body: settings.email,
      href: settings.email ? `mailto:${settings.email}` : undefined,
    },
    {
      icon: Phone,
      title: "Phone",
      body: settings.phone,
      href: settings.phone ? `tel:${settings.phone.replace(/\s/g, "")}` : undefined,
    },
    { icon: MapPin, title: "Business address", body: settings.address },
    { icon: Buildings, title: "Business / legal entity name", body: settings.legalName },
  ].filter((channel) => channel.body.trim() !== "");

  return (
    <div className="page-gutter mx-auto max-w-page py-8 lg:py-12">
      <Breadcrumbs
        items={[{ label: "Home", href: "/" }, { label: "Contact Us" }]}
        className="mb-6"
      />

      <header className="max-w-2xl">
        <p className="eyebrow mb-3">Customer support</p>
        <h1 className="text-4xl leading-[1.05] sm:text-5xl">Contact Us</h1>
        <p className="mt-5 text-base leading-relaxed text-content-muted">
          {contactCopy.intro}
        </p>
      </header>

      <div className="mt-12 grid gap-12 lg:grid-cols-[1fr_20rem] lg:gap-16">
        <ContactForm />

        <aside className="lg:pt-2">
          <h2 className="eyebrow mb-5">Official details</h2>
          <ul className="flex flex-col divide-y divide-line border-y border-line">
            {channels.map(({ icon: Icon, title, body, href }) => (
              <li key={title} className="flex gap-3.5 py-5">
                <Icon size={17} aria-hidden className="mt-0.5 shrink-0 text-content-muted" />
                <div className="min-w-0">
                  <h3 className="font-sans text-2xs font-medium uppercase tracking-[0.12em]">
                    {title}
                  </h3>
                  <p className="mt-1.5 break-words text-sm text-content">
                    {href ? (
                      <a href={href} className="link-underline">
                        {body}
                      </a>
                    ) : (
                      body
                    )}
                  </p>
                </div>
              </li>
            ))}
          </ul>

          <p className="mt-5 text-sm leading-relaxed text-content-muted">{contactCopy.advice}</p>
        </aside>
      </div>
    </div>
  );
}
