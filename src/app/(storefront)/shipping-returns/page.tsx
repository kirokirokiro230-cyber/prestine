import type { Metadata } from "next";
import Link from "next/link";
import { ContentPage, Prose } from "@/components/layout/content-page";
import { ButtonLink } from "@/components/ui/button";
import { storeSettings } from "@/lib/catalog";
import { createMoneyFormatter } from "@/lib/format";


export async function generateMetadata(): Promise<Metadata> {
  const settings = await storeSettings();

  return {
    title: "Shipping & returns",
    description: `Delivery options, international shipping, duties and the ${settings.returnWindowDays}-day free returns policy at ${settings.name}.`,
    alternates: { canonical: "/shipping-returns" },
  };
}

const REGIONS = [
  { region: "United Kingdom", standard: "2–3 business days", express: "Next business day" },
  { region: "Ireland & EU", standard: "3–5 business days", express: "1–2 business days" },
  { region: "United States & Canada", standard: "4–7 business days", express: "2–3 business days" },
  { region: "Australia & New Zealand", standard: "6–9 business days", express: "3–4 business days" },
  { region: "Rest of world", standard: "7–12 business days", express: "On request" },
];

export default async function ShippingReturnsPage() {
  const settings = await storeSettings();

  const money = createMoneyFormatter(settings.currency, settings.locale);

  return (
    <ContentPage
      eyebrow="Service"
      title="Shipping & returns"
      lede={`Complimentary delivery over ${money(settings.freeShippingThreshold)}, ${settings.returnWindowDays} days to change your mind, and a courier who collects from your door.`}
      breadcrumbs={[{ label: "Home", href: "/" }, { label: "Shipping & returns" }]}
      wide
    >
      <div className="flex flex-col gap-14">
        {/* Delivery — one arrangement, so this states it rather than listing options. */}
        <section>
          <h2 className="mb-5 text-2xl leading-tight">Delivery</h2>
          <ul className="divide-y divide-line border-y border-line">
            <li className="flex flex-wrap items-baseline gap-x-6 gap-y-1 py-4">
              <span className="w-36 shrink-0 font-sans text-sm font-medium">
                How long
              </span>
              <span className="flex-1 text-sm text-content-muted">
                {settings.deliveryDaysMin}–{settings.deliveryDaysMax} business days,
                tracked and carbon-neutral.
              </span>
            </li>
            <li className="flex flex-wrap items-baseline gap-x-6 gap-y-1 py-4">
              <span className="w-36 shrink-0 font-sans text-sm font-medium">
                What it costs
              </span>
              <span className="flex-1 text-sm text-content-muted">
                Complimentary over {money(settings.freeShippingThreshold)}.
              </span>
              <span data-numeric className="text-sm text-content">
                {money(settings.standardShippingRate)} below that
              </span>
            </li>
          </ul>
          <p className="mt-4 text-xs text-content-subtle">
            Orders placed before 2pm GMT on a working day are dispatched the same day. Every
            parcel is tracked and delivered carbon-neutral.
          </p>
        </section>

        {/* Regions */}
        <section>
          <h2 className="mb-5 text-2xl leading-tight">Where we ship</h2>
          <div className="overflow-x-auto">
            <table className="w-full min-w-md border-collapse text-sm">
              <caption className="sr-only">
                Estimated delivery times by region
              </caption>
              <thead>
                <tr className="border-b border-line-strong">
                  <th
                    scope="col"
                    className="px-3 py-3 text-left text-2xs font-medium uppercase tracking-[0.1em] text-content-muted"
                  >
                    Region
                  </th>
                  <th
                    scope="col"
                    className="px-3 py-3 text-left text-2xs font-medium uppercase tracking-[0.1em] text-content-muted"
                  >
                    Standard
                  </th>
                  <th
                    scope="col"
                    className="px-3 py-3 text-left text-2xs font-medium uppercase tracking-[0.1em] text-content-muted"
                  >
                    Express
                  </th>
                </tr>
              </thead>
              <tbody>
                {REGIONS.map((row) => (
                  <tr key={row.region} className="border-b border-line last:border-0">
                    <th
                      scope="row"
                      className="whitespace-nowrap px-3 py-3.5 text-left font-medium text-content"
                    >
                      {row.region}
                    </th>
                    <td className="whitespace-nowrap px-3 py-3.5 text-content-muted">
                      {row.standard}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3.5 text-content-muted">
                      {row.express}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Duties */}
        <section>
          <h2 className="mb-5 text-2xl leading-tight">Duties and import taxes</h2>
          <Prose>
            <p>
              Duties and import taxes are calculated and charged at checkout for every
              destination we ship to. That means nothing is owed on delivery and no parcel is
              held at customs waiting for a payment you did not expect.
            </p>
            <p>
              If a return crosses a border, we reclaim the duty ourselves — you are refunded
              the full amount you paid, including tax.
            </p>
          </Prose>
        </section>

        {/* Returns */}
        <section>
          <h2 className="mb-5 text-2xl leading-tight">Returns</h2>
          <Prose>
            <p>
              You have {settings.returnWindowDays} days from delivery to return anything unworn
              with its tags attached, free of charge, from any country we ship to.
            </p>
            <ol>
              <li>
                Open <Link href="/account/orders">your orders</Link> and choose the piece you
                are sending back, or simply reply to your confirmation email.
              </li>
              <li>
                Pick a collection slot from your door, or print a label and use any drop-off
                point.
              </li>
              <li>
                We inspect and refund within three working days of the parcel reaching the
                studio, to the original payment method.
              </li>
            </ol>
            <p>
              <strong>Exchanges.</strong> We hold your replacement size while the return is
              in transit, so it cannot sell out while you are waiting.
            </p>
            <p>
              <strong>Final sale.</strong> Archive sale pieces cannot be returned or
              exchanged. This is flagged on the product page and again at checkout.
            </p>
            <p>
              <strong>Altered pieces.</strong> Free hemming does not affect your right to
              return — send it back hemmed and we will still refund it.
            </p>
          </Prose>
        </section>

        <div className="border border-line bg-surface p-6">
          <h2 className="text-xl leading-tight">Something not right?</h2>
          <p className="mt-2.5 max-w-lg text-sm leading-relaxed text-content-muted">
            If a piece arrived damaged or is not what you expected, tell us and we will make
            it right — replacement, repair or refund, whichever you prefer.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <ButtonLink href="/contact" size="md">
              Contact client care
            </ButtonLink>
            <ButtonLink href="/account/orders" variant="outline" size="md">
              Start a return
            </ButtonLink>
          </div>
        </div>
      </div>
    </ContentPage>
  );
}
