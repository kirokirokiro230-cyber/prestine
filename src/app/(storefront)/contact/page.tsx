import type { Metadata } from "next";
import { Clock, Envelope, MapPin, Phone } from "@phosphor-icons/react/dist/ssr";
import { ContactForm } from "@/components/contact/contact-form";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { site } from "@/lib/config";

export const metadata: Metadata = {
  title: "Contact",
  description:
    "Reach PRESTINE client care about sizing, orders, returns or repairs. We answer most emails within a couple of hours.",
  alternates: { canonical: "/contact" },
};

const CHANNELS = [
  {
    icon: Envelope,
    title: "Email",
    body: site.email,
    href: `mailto:${site.email}`,
    note: "Most replies within two working hours",
  },
  {
    icon: Phone,
    title: "Telephone",
    body: site.phone,
    href: `tel:${site.phone.replace(/\s/g, "")}`,
    note: "Weekdays 9am – 6pm GMT",
  },
  {
    icon: MapPin,
    title: "The studio",
    body: site.address,
    note: "Tuesday – Saturday, by appointment",
  },
  {
    icon: Clock,
    title: "Repairs & alterations",
    body: "Send anything we made, any time",
    note: "Free for as long as you own the piece",
  },
];

export default function ContactPage() {
  return (
    <div className="page-gutter mx-auto max-w-page py-8 lg:py-12">
      <Breadcrumbs
        items={[{ label: "Home", href: "/" }, { label: "Contact" }]}
        className="mb-6"
      />

      <header className="max-w-2xl">
        <p className="eyebrow mb-3">Client care</p>
        <h1 className="text-4xl leading-[1.05] sm:text-5xl">Talk to a person.</h1>
        <p className="mt-5 text-base leading-relaxed text-content-muted">
          Client care is a small team in the London studio who have handled every piece we
          make. Tell us your measurements and we will tell you which size we would send.
        </p>
      </header>

      <div className="mt-12 grid gap-12 lg:grid-cols-[1fr_20rem] lg:gap-16">
        <ContactForm />

        <aside className="lg:pt-2">
          <h2 className="eyebrow mb-5">Other ways to reach us</h2>
          <ul className="flex flex-col divide-y divide-line border-y border-line">
            {CHANNELS.map(({ icon: Icon, title, body, href, note }) => (
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
                  <p className="mt-1 text-xs text-content-subtle">{note}</p>
                </div>
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </div>
  );
}
