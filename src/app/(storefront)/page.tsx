import type { Metadata } from "next";
import { CategoryTiles } from "@/components/home/category-tiles";
import { EditorialSplit } from "@/components/home/editorial-split";
import { HeroCarousel } from "@/components/home/hero-carousel";
import { Marquee } from "@/components/home/marquee";
import { Testimonials } from "@/components/home/testimonials";
import { ProductRail } from "@/components/product/product-grid";
import { SectionHeading } from "@/components/ui/section-heading";
import {
  bestSellers,
  heroBanners,
  newArrivals,
  storeSettings,
} from "@/lib/catalog";

export async function generateMetadata(): Promise<Metadata> {
  const settings = await storeSettings();

  return {
    // The layout template appends the brand name, so the home title overrides it to
    // avoid "PRESTINE · PRESTINE".
    title: `${settings.name} — ${settings.tagline}`,
    description: settings.description,
    alternates: { canonical: "/" },
  };
}

export default async function HomePage() {
  /*
   * Settings first, because the arrivals count comes from it. One extra await before
   * the parallel fetch rather than over-fetching a fixed number and slicing in the
   * component — a merchant who sets this to 4 should not pay to load 24.
   */
  const settings = await storeSettings();

  const [arrivals, bestsellers, banners] = await Promise.all([
    /*
     * One more than the merchant asked for. The rail shows `homeNewArrivalsCount`
     * cards; fetching one extra is what makes the next arrow appear, and is how the
     * section signals there is more behind it without loading the whole catalogue.
     */
    newArrivals(settings.homeNewArrivalsCount + 1),
    bestSellers(6),
    heroBanners(),
  ]);

  return (
    <>
      {/*
        The merchant-managed carousel is the hero now. There used to be a second,
        product-led hero section below it with a hardcoded headline; it was removed, so
        this is the only thing above the fold. If every banner is unpublished or out of
        schedule the page opens on the marquee and the category grid — still coherent,
        but a merchant with no live banner has an unusually quiet top of page, which is
        worth knowing before unpublishing the last one.
      */}
      {banners.length > 0 ? <HeroCarousel banners={banners} /> : null}

      {/* Merchant-managed in Settings → Home page. Renders nothing when emptied. */}
      {settings.marqueeItems.length > 0 ? <Marquee items={settings.marqueeItems} /> : null}

      {/* Categories */}
      <section className="page-gutter mx-auto max-w-page py-16 lg:py-20">
        <SectionHeading
          eyebrow="The wardrobe"
          title="Shop by category"
          description="Eight categories, each built around a handful of pieces we are willing to stand behind for a decade."
          action={{ label: "All clothing", href: "/shop" }}
          className="mb-10"
        />
        <CategoryTiles />
      </section>

      {/* New arrivals */}
      <section className="page-gutter mx-auto max-w-page pb-16 lg:pb-20">
        <SectionHeading
          eyebrow="Just landed"
          title="New arrivals"
          description="Delivered in small runs. Once a colourway sells through, it is restocked only if the mill still has the yarn."
          action={{ label: "View all", href: "/collections/new-arrivals" }}
          className="mb-10"
        />
        {/*
          A rail rather than a grid, so a merchant who picks more pieces than the
          configured count gets arrows to the rest instead of a truncated section.
        */}
        <ProductRail products={arrivals} label="new arrivals" />
      </section>

      {/* Craft story */}
      <EditorialSplit
        eyebrow="How it is made"
        title="Fewer styles. Made properly. Restocked, not replaced."
        body={[
          "We work with eleven mills, most of them family-run, and we visit every one. That means we can specify things that do not show up in a photograph — fibre length in cashmere, thread count in poplin, whether a collar is fused or sewn.",
          "It also means our range is small. We would rather make thirty-three pieces we can defend line by line than three hundred we cannot.",
        ]}
        bullets={[
          "Grade-A cashmere only — fibres over 34mm",
          "Sewn-in collar interlinings, never fused",
          "Single-needle seams at 18 stitches per inch",
          "Free repairs for as long as you own the piece",
        ]}
        cta={{ label: "More about us", href: "/about" }}
        productSlug="grade-a-cashmere-crew"
        className="py-16 lg:py-20"
      />

      {/* Best sellers rail */}
      <section className="page-gutter mx-auto max-w-page py-16 lg:py-20">
        <SectionHeading
          eyebrow="Reordered most"
          title="Best sellers"
          description="Ranked on repeat purchases, not page views."
          action={{ label: "View all", href: "/collections/best-sellers" }}
          className="mb-10"
        />
        <ProductRail products={bestsellers} label="best sellers" />
      </section>

      <Testimonials />

      {/* Materials story */}
      <EditorialSplit
        eyebrow="Materials"
        title="Natural fibres, traceable to the farm where we can manage it."
        body={[
          "Wool from Biella and Hawick, flax from Normandy, denim from Okayama and Candiani, leather from a Northampton tannery that has been running since 1863.",
          "Where a synthetic genuinely performs better — insulation, waterproof membranes — we use a recycled one and say so on the product page rather than burying it.",
        ]}
        cta={{ label: "See lower-impact pieces", href: "/shop?sustainable=1" }}
        productSlug="selvedge-straight-jean"
        reverse
        className="py-16 lg:py-20"
      />


    </>
  );
}
