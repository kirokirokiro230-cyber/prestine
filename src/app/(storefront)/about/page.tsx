import type { Metadata } from "next";
import { EditorialSplit } from "@/components/home/editorial-split";
import { Marquee } from "@/components/home/marquee";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { ButtonLink } from "@/components/ui/button";
import { Reveal } from "@/components/ui/reveal";
import { SectionHeading } from "@/components/ui/section-heading";
import { site } from "@/lib/config";

export const metadata: Metadata = {
  title: "About us",
  description:
    "Who PRESTINE is: a small team making a thirty-three piece range since 2017, sold direct, restocked rather than replaced, and repaired free for as long as you own it.",
  alternates: { canonical: "/about" },
};

/**
 * Milestones rather than a mission statement.
 *
 * Dates and numbers are checkable, which is the point — an about page that only
 * asserts values reads the same whether or not any of it is true.
 */
const MILESTONES = [
  { year: "2017", event: "Founded in London with one piece: an unlined, double-faced overcoat." },
  { year: "2018", event: "First repairs desk opens. Free repairs become a standing promise, not a policy." },
  { year: "2019", event: "The Essentials launch — six pieces designed to be restocked indefinitely." },
  { year: "2021", event: "Studio and workshop move under one roof. Fittings by appointment begin." },
  { year: "2023", event: "Carbon-neutral delivery on every order, in every market we ship to." },
  { year: "2025", event: "Thirty-three pieces in the range. No plans to make it much larger." },
];

const VALUES = [
  {
    number: "01",
    title: "Spend it where it shows up",
    body: "Every cost we take on has to change how a piece wears, not how it photographs. If a detail only exists to be seen in a product shot, we do not pay for it.",
  },
  {
    number: "02",
    title: "Small runs, restocked",
    body: "We would rather sell out of a good colour than discount a bad one. Core pieces come back in the same shades season after season, so a favourite can be replaced rather than mourned.",
  },
  {
    number: "03",
    title: "Repair before replace",
    body: "Free repairs for as long as you own the piece — seams, buttons, moth holes, zips. It costs us money and saves you more, and it is the only honest test of whether we believe our own claims.",
  },
  {
    number: "04",
    title: "Say what it is",
    body: "Where a recycled synthetic genuinely performs better than a natural fibre, we use it and put it on the product page. Where a piece is made outside Europe, we name the city and the certification.",
  },
];

export default function AboutPage() {
  return (
    <>
      <div className="page-gutter mx-auto max-w-page py-8 lg:py-12">
        <Breadcrumbs
          items={[{ label: "Home", href: "/" }, { label: "About us" }]}
          className="mb-6"
        />

        <header className="max-w-3xl">
          <p className="eyebrow mb-3">Since 2017</p>
          <h1 className="text-4xl leading-[1.03] sm:text-5xl lg:text-6xl">
            A small company, a short range, and no plans to grow either quickly.
          </h1>
          <p className="mt-6 text-base leading-relaxed text-content-muted sm:text-lg">
            {site.name} started because two of us could not find a coat that lasted more
            than three winters at any price. We began with one — unlined, double-faced,
            hand-finished — and have added a piece at a time since, only when we could
            make it properly.
          </p>
          <p className="mt-4 text-base leading-relaxed text-content-muted sm:text-lg">
            We are still a team of fourteen. We sell direct, which means no wholesale
            margin to cover and no reason to invent a new collection twice a year. What
            that buys you is a range you can learn, and pieces that are still there when
            you come back for another.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <ButtonLink href="/shop" size="lg">
              Shop the range
            </ButtonLink>
            <ButtonLink href="/contact" variant="outline" size="lg">
              Talk to us
            </ButtonLink>
          </div>
        </header>
      </div>

      <Marquee
        items={[
          "Founded 2017",
          "A team of fourteen",
          "Thirty-three pieces",
          "Free repairs for life",
          "Sold direct, never wholesale",
          "Carbon-neutral delivery",
        ]}
      />

      {/* Values */}
      <section className="page-gutter mx-auto max-w-page py-16 lg:py-20">
        <SectionHeading
          eyebrow="What we stand for"
          title="Four rules we do not bend"
          className="mb-12"
        />

        <ol className="grid gap-x-12 gap-y-10 sm:grid-cols-2">
          {VALUES.map((value, index) => (
            <Reveal as="li" key={value.number} delay={index * 80}>
              <span
                data-numeric
                className="font-display text-3xl leading-none text-clay-300 dark:text-clay-500"
              >
                {value.number}
              </span>
              <h3 className="mt-4 font-display text-2xl leading-tight">{value.title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-content-muted">{value.body}</p>
            </Reveal>
          ))}
        </ol>
      </section>

      {/* Story */}
      <section
        id="story"
        className="page-gutter mx-auto max-w-page scroll-mt-28 py-16 lg:py-20"
      >
        <SectionHeading
          eyebrow="The story"
          title="How we got here"
          description="Eight years, one piece at a time. The range has grown roughly four garments a year, which is about as fast as we can add one without cutting a corner."
          className="mb-10"
        />

        <ol className="divide-y divide-line border-y border-line">
          {MILESTONES.map((milestone) => (
            <li
              key={milestone.year}
              className="flex flex-col gap-1 py-4 sm:flex-row sm:items-baseline sm:gap-8"
            >
              <span
                data-numeric
                className="font-sans text-sm font-medium sm:w-56 sm:shrink-0"
              >
                {milestone.year}
              </span>
              <span className="text-sm leading-relaxed text-content-muted">
                {milestone.event}
              </span>
            </li>
          ))}
        </ol>
      </section>

      <EditorialSplit
        eyebrow="Longevity"
        title="Free repairs, for as long as you own it."
        body={[
          "Send us anything we made and we will repair it at no cost — a seam, a button, a moth hole, a broken zip. No receipt required, no time limit, no argument.",
          "We do it because it is the only claim in this industry that cannot be faked. A brand that offers lifetime repairs on badly made clothes goes out of business.",
        ]}
        cta={{ label: "How repairs work", href: "/faq#care" }}
        productSlug="atelier-double-faced-overcoat"
        reverse
      />

      {/* Stores */}
      <section id="stores" className="page-gutter mx-auto max-w-page scroll-mt-28 pb-20">
        <SectionHeading
          eyebrow="Visit"
          title="The studio"
          description="One room, by appointment, above the workshop. Every piece in every colourway, and someone who can tell you how it was made."
          className="mb-10"
        />

        <div className="grid gap-8 border border-line bg-surface p-6 sm:grid-cols-3 sm:p-8">
          <div>
            <h3 className="eyebrow mb-3">Address</h3>
            <address className="text-sm not-italic leading-relaxed text-content-muted">
              {site.address}
              <br />
              United Kingdom
            </address>
          </div>
          <div>
            <h3 className="eyebrow mb-3">Opening hours</h3>
            <p className="text-sm leading-relaxed text-content-muted">
              Tuesday – Saturday
              <br />
              11am – 6pm, by appointment
            </p>
          </div>
          <div>
            <h3 className="eyebrow mb-3">Book a fitting</h3>
            <p className="text-sm leading-relaxed text-content-muted">
              <a href={`mailto:${site.email}`} className="link-underline text-content">
                {site.email}
              </a>
              <br />
              <a
                href={`tel:${site.phone.replace(/\s/g, "")}`}
                className="link-underline text-content"
              >
                {site.phone}
              </a>
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
