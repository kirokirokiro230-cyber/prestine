import type { Metadata } from "next";
import Link from "next/link";
import { Accordion } from "@/components/ui/accordion";
import { ButtonLink } from "@/components/ui/button";
import { ContentPage } from "@/components/layout/content-page";
import { storeSettings } from "@/lib/catalog";
import { createMoneyFormatter } from "@/lib/format";
import type { StoreSettings } from "@/lib/types";

export async function generateMetadata(): Promise<Metadata> {
  const settings = await storeSettings();

  return {
    title: "FAQ",
    description: `Answers on sizing, shipping, returns, repairs, materials and care for ${settings.name} clothing.`,
    alternates: { canonical: "/faq" },
  };
}

/**
 * Answers are built from settings rather than hardcoded, so the shipping threshold,
 * standard rate, returns window and contact address quoted here can never contradict
 * what checkout actually charges.
 */
function buildSections(
  settings: StoreSettings,
  money: (minorUnits: number) => string,
) {
  return [
  {
    id: "sizing",
    heading: "Sizing & fit",
    items: [
      {
        id: "between-sizes",
        title: "I’m between sizes — up or down?",
        content: (
          <>
            <p>
              Size up for outerwear and knitwear if you intend to layer over a shirt; size
              down in jersey, which relaxes about half a size with wear. Trousers and denim
              are cut true to the stated waist and do not stretch.
            </p>
            <p className="mt-3">
              If you are unsure, email your chest, waist or hip measurement to{" "}
              <a href={`mailto:${settings.email}`}>{settings.email}</a> and we will tell you which
              size we would send.
            </p>
          </>
        ),
      },
      {
        id: "size-charts",
        title: "Where are the measurements?",
        content: (
          <p>
            Every product page has a size guide beside the size picker, and there is a full
            chart on the <Link href="/size-guide">size guide page</Link>. Measurements are
            body measurements, not garment measurements.
          </p>
        ),
      },
      {
        id: "alterations",
        title: "Do you hem trousers and denim?",
        content: (
          <p>
            Yes, free of charge. Selvedge denim is chain-stitched to keep the original roping
            on the hem. Add your inseam in the order notes, or email us after ordering.
            Altered pieces can still be returned.
          </p>
        ),
      },
    ],
  },
  {
    id: "orders",
    heading: "Orders & shipping",
    items: [
      {
        id: "shipping-cost",
        title: "How much is delivery?",
        content: (
          <p>
            Standard delivery is complimentary over {money(settings.freeShippingThreshold)}{" "}
            and {money(settings.standardShippingRate)} below that, arriving in 3–5
            business days. Express and
            nominated-day options are offered at checkout. All delivery is tracked and
            carbon-neutral.
          </p>
        ),
      },
      {
        id: "international",
        title: "Do you ship internationally?",
        content: (
          <p>
            We ship to most of Europe, North America, Australia and parts of Asia. Duties
            and import taxes are calculated at checkout and paid up front, so nothing is
            owed on delivery.
          </p>
        ),
      },
      {
        id: "amend",
        title: "Can I change or cancel an order?",
        content: (
          <p>
            Any order that has not yet been dispatched can be amended or cancelled. Email{" "}
            <a href={`mailto:${settings.email}`}>{settings.email}</a> with your reference and we
            will sort it — usually within the hour during working days.
          </p>
        ),
      },
      {
        id: "stock",
        title: "Will a sold-out size come back?",
        content: (
          <p>
            Core pieces are restocked in the same colours, usually within six weeks. Archive
            sale colourways and end-of-run sizes do not return. Email us and we will tell
            you honestly which it is.
          </p>
        ),
      },
    ],
  },
  {
    id: "returns",
    heading: "Returns & exchanges",
    items: [
      {
        id: "window",
        title: "What is the returns window?",
        content: (
          <p>
            {settings.returnWindowDays} days from delivery, free, on anything unworn with tags
            attached. Book a collection from your door in your account or use any drop-off
            point. Refunds are issued within three working days of the parcel reaching us.
          </p>
        ),
      },
      {
        id: "exchange",
        title: "Can I exchange for another size?",
        content: (
          <p>
            Yes, and we hold the replacement size for you while the return is in transit so
            it cannot sell out from under you. Reply to your confirmation email with the
            size you need.
          </p>
        ),
      },
      {
        id: "sale",
        title: "Are sale pieces returnable?",
        content: (
          <p>
            Archive sale pieces are final sale and cannot be returned or exchanged. This is
            stated on the product page and again at checkout, because it is the one
            exception to our returns policy.
          </p>
        ),
      },
    ],
  },
  {
    id: "care",
    heading: "Care & repairs",
    items: [
      {
        id: "repairs",
        title: "How do free repairs work?",
        content: (
          <>
            <p>
              Email <a href={`mailto:${settings.email}`}>{settings.email}</a> with a photograph. We
              send a prepaid label, repair the piece and send it back. Seams, buttons, zips,
              moth holes and worn cuffs are all covered.
            </p>
            <p className="mt-3">
              There is no time limit and no receipt required — if we made it, we will fix
              it. Repairs typically take two to three weeks.
            </p>
          </>
        ),
      },
      {
        id: "cashmere",
        title: "How should I wash cashmere?",
        content: (
          <p>
            Hand wash cool with a pH-neutral wool wash, press the water out in a towel
            rather than wringing, and dry flat away from direct heat. Fold rather than hang.
            Every cashmere piece ships with a boxwood comb for de-pilling.
          </p>
        ),
      },
      {
        id: "waxed",
        title: "How do I re-wax the field jacket?",
        content: (
          <p>
            Send it to us and we will do it free for the first five years. If you would
            rather do it yourself, sponge the jacket clean, apply dry-finish wax with a cloth
            in thin layers, and warm it through with a hairdryer to even out the finish.
          </p>
        ),
      },
      {
        id: "denim",
        title: "How often should I wash raw denim?",
        content: (
          <p>
            Less than you think — every ten to fifteen wears, cold and inside out, line dried
            out of direct sun. Expect indigo to transfer onto light surfaces for the first
            month. Ours is sanforised, so it will not shrink significantly.
          </p>
        ),
      },
    ],
  },
  ];
}

type Section = ReturnType<typeof buildSections>[number];

/** FAQ structured data — earns the expandable Q&A treatment in search results. */
function faqJsonLd(sections: Section[], baseUrl: string) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: sections.flatMap((section) =>
      section.items.map((item) => ({
        "@type": "Question",
        name: item.title,
        acceptedAnswer: {
          "@type": "Answer",
          // Structured data wants plain text; the rendered answer is the JSX above.
          text: `See ${baseUrl}/faq#${section.id} for the full answer.`,
        },
      })),
    ),
  };
}

export default async function FaqPage() {
  const settings = await storeSettings();
  const money = createMoneyFormatter(settings.currency, settings.locale);
  const sections = buildSections(settings, money);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            faqJsonLd(sections, settings.url.replace(/\/$/, "")),
          ),
        }}
      />

      <ContentPage
        eyebrow="Support"
        title="Questions, answered."
        lede="The things people actually ask us. If yours is not here, client care replies to most emails within a couple of hours."
        breadcrumbs={[{ label: "Home", href: "/" }, { label: "FAQ" }]}
      >
        <div className="flex flex-col gap-12">
          {sections.map((section) => (
            <section key={section.id} id={section.id} className="scroll-mt-28">
              <h2 className="mb-5 text-2xl leading-tight">{section.heading}</h2>
              <Accordion
                items={section.items}
                defaultOpen={[section.items[0].id]}
              />
            </section>
          ))}
        </div>

        <div className="mt-14 border border-line bg-surface p-6">
          <h2 className="text-xl leading-tight">Still not sure?</h2>
          <p className="mt-2.5 text-sm leading-relaxed text-content-muted">
            Tell us what you are trying to work out and we will give you a straight answer —
            including when the answer is “this piece is not right for you”.
          </p>
          <ButtonLink href="/contact" size="md" className="mt-5">
            Contact client care
          </ButtonLink>
        </div>
      </ContentPage>
    </>
  );
}
