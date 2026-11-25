import type { Metadata } from "next";
import { ArrowRight } from "@phosphor-icons/react/dist/ssr";
import { TurtleMark, Wordmark } from "@/components/brand/brand-mark";
import { NameOriginSection } from "@/components/brand/name-origin-section";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { ButtonLink } from "@/components/ui/button";
import { ResponsiveImage } from "@/components/ui/responsive-image";
import { Reveal } from "@/components/ui/reveal";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "About KABUDA",
  description:
    "KABUDA creates modern men’s and unisex fashion with better fit, good quality, contemporary design and everyday versatility — made with patience and designed to be worn.",
  alternates: { canonical: "/about" },
  openGraph: {
    title: "About KABUDA — Wear The Legacy",
    description:
      "Modern men’s and unisex fashion, made with patience and designed for everyday wear.",
    url: "/about",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "About KABUDA — Wear The Legacy",
    description:
      "Modern men’s and unisex fashion, made with patience and designed for everyday wear.",
  },
};

interface AboutImage {
  src: string;
  mobileSrc?: string;
  tabletSrc?: string;
  alt: string;
}

/**
 * Add generated campaign files under `public/images/about/`, then replace a null entry
 * with its paths. Every slot has a complete brand-art fallback, so missing photography
 * never leaves an empty or broken panel.
 */
const ABOUT_IMAGES: Record<"hero" | "story" | "community", AboutImage | null> = {
  hero: null,
  story: null,
  community: null,
};

const VALUES = [
  {
    number: "01",
    title: "Better fit",
    body: "We know it is all about how it fits. Every piece starts with proportion, comfort and ease of movement.",
  },
  {
    number: "02",
    title: "Good quality",
    body: "Fabrics, construction and finishing are considered for the reality of everyday dressing.",
  },
  {
    number: "03",
    title: "Modern design",
    body: "Modern tailoring meets a contemporary point of view, without unnecessary complication.",
  },
  {
    number: "04",
    title: "Accessible pricing",
    body: "Premium style with everyday value, because good design should earn its place in your wardrobe.",
  },
  {
    number: "05",
    title: "Everyday versatility",
    body: "Wear it one way or two — pieces designed to elevate your style and transition with your day.",
  },
];

export default function AboutPage() {
  return (
    <>
      {/* Introduction */}
      <section className="page-gutter mx-auto max-w-page pb-20 pt-8 lg:pb-28 lg:pt-12">
        <Breadcrumbs
          items={[{ label: "Home", href: "/" }, { label: "About KABUDA" }]}
          className="mb-8 lg:mb-12"
        />

        <div className="grid items-center gap-10 lg:grid-cols-[0.92fr_1.08fr] lg:gap-16">
          <Reveal as="header" className="max-w-2xl py-4 lg:py-10">
            <p className="eyebrow mb-5">KABUDA — About us</p>
            <h1 className="text-[clamp(3.5rem,8vw,7.5rem)] leading-[0.84] tracking-[-0.055em]">
              Wear The
              <br />
              <span className="italic">Legacy.</span>
            </h1>
            <p className="mt-8 max-w-xl text-lg leading-8 text-content-muted sm:text-xl">
              We create modern men&apos;s and unisex fashion with the comfort of a
              well-fitting piece and the wearability of today&apos;s dressing.
            </p>
            <p className="mt-5 max-w-xl text-sm leading-7 text-content-muted sm:text-base">
              Curated collections of shirts, trousers and cargo pants, co-ord sets,
              hoodies, shorts and everyday staples — grounded in good fit, good quality,
              good design and good value.
            </p>
            <p className="mt-6 font-display text-2xl italic text-content">
              This is KABUDA.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <ButtonLink href="/shop" size="lg">
                Explore the collection
                <ArrowRight size={15} aria-hidden />
              </ButtonLink>
              <ButtonLink href="#our-story" variant="outline" size="lg">
                Our story
              </ButtonLink>
            </div>
          </Reveal>

          <Reveal delay={100}>
            <AboutMedia
              slot="hero"
              image={ABOUT_IMAGES.hero}
              variant="turtle"
              label="Made with patience"
              className="aspect-4/5 min-h-[32rem] lg:min-h-[44rem]"
              priority
            />
          </Reveal>
        </div>
      </section>

      {/* Brand principles strip */}
      <div className="overflow-hidden border-y border-line bg-surface">
        <div className="page-gutter mx-auto grid max-w-page divide-y divide-line sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          {["Made with patience", "Designed to be worn", "Wear the legacy"].map(
            (line, index) => (
              <p
                key={line}
                className="flex items-center gap-4 py-5 text-2xs font-semibold uppercase tracking-[0.18em] text-content sm:px-6 sm:first:pl-0 sm:last:pr-0"
              >
                <span data-numeric className="text-content-subtle">
                  0{index + 1}
                </span>
                {line}
              </p>
            ),
          )}
        </div>
      </div>

      {/* Our story */}
      <section
        id="our-story"
        className="page-gutter mx-auto max-w-page scroll-mt-28 py-20 lg:py-28"
      >
        <div className="grid items-stretch gap-6 lg:grid-cols-2">
          <Reveal>
            <AboutMedia
              slot="story"
              image={ABOUT_IMAGES.story}
              variant="story"
              label="Made with patience"
              className="h-full min-h-[30rem] lg:min-h-[44rem]"
            />
          </Reveal>

          <Reveal
            delay={90}
            className="flex flex-col justify-center rounded-[1.75rem] border border-line bg-surface p-7 shadow-sm sm:p-10 lg:p-14"
          >
            <p className="eyebrow">Our story</p>
            <h2 className="mt-5 text-4xl leading-[1] sm:text-5xl lg:text-6xl">
              Made With Patience.
            </h2>
            <div className="mt-8 flex flex-col gap-5 text-sm leading-7 text-content-muted sm:text-base">
              <p>
                Sometimes fashion can be fickle. It can come and go, leaving you
                constantly chasing the next big thing. We sought to change that.
              </p>
              <p>
                With KABUDA, we wanted to offer something different — pieces made with
                patience and designed to be dressed in, not simply worn once.
              </p>
              <p>
                From the fabric to the fit to the style, every element is purposefully
                designed and made with care, because we know you want to wear it for
                years to come.
              </p>
              <p>
                While we create pieces that can become staples in your wardrobe, we also
                understand the need to refresh it — to evolve with the times and have
                something new to wear.
              </p>
            </div>
          </Reveal>
        </div>
      </section>

      {/* More than clothing */}
      <section className="relative overflow-hidden bg-inverse text-on-inverse">
        <div
          aria-hidden
          className="absolute -right-40 -top-40 size-[34rem] rounded-full border border-on-inverse/10"
        />
        <div
          aria-hidden
          className="absolute -right-20 -top-20 size-[20rem] rounded-full border border-on-inverse/10"
        />
        <div className="page-gutter relative mx-auto grid max-w-page gap-12 py-20 lg:grid-cols-[0.8fr_1.2fr] lg:py-28">
          <Reveal>
            <p className="text-2xs font-semibold uppercase tracking-[0.2em] text-on-inverse/55">
              More than just clothing
            </p>
            <h2 className="mt-5 max-w-xl text-5xl leading-[0.96] text-on-inverse sm:text-6xl lg:text-7xl">
              Your everyday should always reflect you.
            </h2>
          </Reveal>

          <Reveal delay={100} className="flex flex-col justify-end lg:pb-2">
            <div className="max-w-2xl space-y-5 text-base leading-8 text-on-inverse/72 sm:text-lg">
              <p>
                We create fashion with style, individuality and everyday dressing in
                mind.
              </p>
              <p>
                Inspired by contemporary dressing, western wear, street style and
                everyday life, we make clothing with a sense of now and no lack of
                detail.
              </p>
              <p>
                Sometimes you want to dress less. Sometimes you want to dress more.
                Either way, your everyday should reflect you — with minimal fuss and
                even less effort.
              </p>
            </div>
          </Reveal>
        </div>
      </section>

      {/* Why KABUDA */}
      <section className="page-gutter mx-auto max-w-page py-20 lg:py-28">
        <Reveal className="mb-12 max-w-3xl lg:mb-16">
          <p className="eyebrow">Why KABUDA?</p>
          <h2 className="mt-5 text-5xl leading-[0.95] sm:text-6xl lg:text-7xl">
            We keep it simple.
          </h2>
          <p className="mt-5 max-w-xl text-base leading-7 text-content-muted">
            Five principles shape every piece we make and every collection we put into
            the world.
          </p>
        </Reveal>

        <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
          {VALUES.map((value, index) => (
            <Reveal
              as="li"
              key={value.number}
              delay={index * 65}
              className={cn(
                "group rounded-[1.4rem] border border-line bg-surface p-6 shadow-xs transition-[border-color,box-shadow,transform] duration-300 hover:-translate-y-1 hover:border-line-strong hover:shadow-md",
                index < 3 ? "lg:col-span-2" : "lg:col-span-3",
              )}
            >
              <div className="flex items-center justify-between border-b border-line pb-5">
                <span data-numeric className="text-xs font-semibold text-content-subtle">
                  {value.number}
                </span>
                <span
                  aria-hidden
                  className="size-2 rounded-full bg-content transition-transform duration-300 group-hover:scale-150"
                />
              </div>
              <h3 className="mt-7 text-2xl leading-tight">{value.title}</h3>
              <p className="mt-3 text-sm leading-6 text-content-muted">{value.body}</p>
            </Reveal>
          ))}
        </ol>
      </section>

      {/* Name origin */}
      <NameOriginSection id="behind-the-name" />

      {/* Community */}
      <section className="page-gutter mx-auto max-w-page py-20 lg:py-28">
        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <Reveal className="flex flex-col justify-center rounded-[1.75rem] border border-line bg-surface p-7 shadow-sm sm:p-10 lg:p-14">
            <p className="eyebrow">Join the KABUDA community</p>
            <h2 className="mt-5 text-4xl leading-[1] sm:text-5xl lg:text-6xl">
              We&apos;re only getting started.
            </h2>
            <div className="mt-7 max-w-2xl space-y-5 text-sm leading-7 text-content-muted sm:text-base">
              <p>
                KABUDA was born as a men&apos;s and unisex clothing brand specialising in
                everyday dressing with better fit, better quality and better design.
              </p>
              <p>
                We want to build an ecosystem around men&apos;s and unisex fashion,
                individuality and everyday dressing. If you want to be part of something
                bigger — something that celebrates clothing, personal style and the way
                we dress every day — welcome to KABUDA.
              </p>
            </div>
            <div className="mt-9 flex flex-wrap gap-3">
              <ButtonLink href="/shop" size="lg">
                Wear the legacy
                <ArrowRight size={15} aria-hidden />
              </ButtonLink>
              <ButtonLink href="/contact" variant="outline" size="lg">
                Connect with us
              </ButtonLink>
            </div>
          </Reveal>

          <Reveal delay={100}>
            <AboutMedia
              slot="community"
              image={ABOUT_IMAGES.community}
              variant="wordmark"
              label="Designed to be worn"
              className="h-full min-h-[30rem]"
            />
          </Reveal>
        </div>
      </section>

      {/* Closing manifesto */}
      <section className="border-t border-line bg-surface py-20 text-center lg:py-28">
        <div className="page-gutter mx-auto max-w-page">
          <Reveal className="mx-auto max-w-5xl">
            <p className="font-display text-3xl italic text-content-muted sm:text-4xl">
              Made With Patience.
            </p>
            <p className="mt-2 font-display text-3xl italic text-content-muted sm:text-4xl">
              Designed To Be Worn.
            </p>
            <p className="mt-8 text-[clamp(3.5rem,9vw,8rem)] font-semibold uppercase leading-[0.82] tracking-[-0.055em] text-content">
              Wear The Legacy.
            </p>
          </Reveal>
        </div>
      </section>
    </>
  );
}

function AboutMedia({
  slot,
  image,
  variant,
  label,
  className,
  priority = false,
}: {
  slot: "hero" | "story" | "community";
  image: AboutImage | null;
  variant: "turtle" | "story" | "wordmark";
  label: string;
  className?: string;
  priority?: boolean;
}) {
  return (
    <div
      data-about-image-slot={slot}
      className={cn(
        "relative overflow-hidden rounded-[1.75rem] border border-line bg-canvas shadow-md",
        className,
      )}
    >
      {image ? (
        <>
          <ResponsiveImage
            src={image.src}
            mobileSrc={image.mobileSrc}
            tabletSrc={image.tabletSrc}
            alt={image.alt}
            priority={priority}
            className="absolute inset-0 size-full object-cover"
          />
          <div
            aria-hidden
            className="absolute inset-0 bg-gradient-to-t from-ink-950/45 via-transparent to-transparent"
          />
        </>
      ) : (
        <BrandFallback variant={variant} />
      )}

      <p className="absolute bottom-5 left-5 rounded-full border border-line bg-canvas/88 px-4 py-2 text-2xs font-semibold uppercase tracking-[0.16em] text-content shadow-sm backdrop-blur-md sm:bottom-6 sm:left-6">
        {label}
      </p>
    </div>
  );
}

function BrandFallback({ variant }: { variant: "turtle" | "story" | "wordmark" }) {
  if (variant === "story") {
    return (
      <div className="absolute inset-0 flex flex-col justify-between bg-surface-sunken p-7 sm:p-10">
        <span className="text-2xs font-semibold uppercase tracking-[0.2em] text-content-subtle">
          KABUDA / Chapter one
        </span>
        <div aria-hidden className="absolute inset-1/2 size-[70%] -translate-x-1/2 -translate-y-1/2 rounded-full border border-line" />
        <p className="relative max-w-sm font-display text-5xl italic leading-[0.95] text-content sm:text-6xl">
          Purposefully designed. Made with care.
        </p>
      </div>
    );
  }

  if (variant === "wordmark") {
    return (
      <div className="absolute inset-0 grid place-items-center bg-surface-sunken p-10">
        <div aria-hidden className="absolute inset-8 rounded-full border border-line sm:inset-14" />
        <Wordmark className="relative w-[72%] max-w-md text-content" />
      </div>
    );
  }

  return (
    <div className="absolute inset-0 grid place-items-center bg-surface-sunken">
      <div aria-hidden className="absolute inset-[8%] rounded-full border border-line" />
      <div aria-hidden className="absolute inset-[18%] rounded-full border border-line" />
      <div aria-hidden className="absolute left-1/2 top-0 h-full w-px bg-line" />
      <div aria-hidden className="absolute left-0 top-1/2 h-px w-full bg-line" />
      <TurtleMark className="relative w-[42%] text-content" />
      <span className="absolute right-6 top-6 font-display text-2xl italic text-content-subtle">
        Est. with patience
      </span>
    </div>
  );
}
