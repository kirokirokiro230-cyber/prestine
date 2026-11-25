import type { Metadata } from "next";
import { ContentPage, Prose } from "@/components/layout/content-page";
import { SizeGuideContent } from "@/components/product/size-guide-content";
import { ButtonLink } from "@/components/ui/button";
import { site } from "@/lib/config";

export const metadata: Metadata = {
  title: "Size guide",
  description:
    "Garment measurements for PRESTINE tops, trousers and denim in inches and centimetres, with diagrams showing exactly how to measure.",
  alternates: { canonical: "/size-guide" },
};

export default function SizeGuidePage() {
  return (
    <ContentPage
      eyebrow="Fit"
      title="Size guide"
      lede="All figures are measurements of the garment, not of your body, in inches or centimetres. The surest way to choose is to lay a piece you already own and like on a flat surface, measure it the same way, and pick the closest size."
      breadcrumbs={[{ label: "Home", href: "/" }, { label: "Size guide" }]}
      wide
    >
      <div className="flex flex-col gap-14">
        <section>
          <h2 className="mb-5 text-2xl leading-tight">T-shirts &amp; tops</h2>
          <SizeGuideContent system="alpha" showAdvice={false} />
        </section>

        <section>
          <h2 className="mb-5 text-2xl leading-tight">Trousers &amp; denim</h2>
          <SizeGuideContent system="waist" showAdvice={false} />
        </section>

        <section>
          <h2 className="mb-5 text-2xl leading-tight">How our pieces fit</h2>
          <Prose>
            <p>
              Outerwear is cut with room for a knit underneath. If you plan to wear a coat
              over tailoring, take your usual size — we have already allowed for it.
            </p>
            <p>
              Knitwear is fully fashioned and true to size, with a slim body through the
              waist. Jersey relaxes about half a size with wear, so size down for a close
              fit.
            </p>
            <p>
              Trousers and denim are cut to the stated waist in inches, with no vanity
              sizing. Rigid denim will give roughly half an inch at the waist after a week
              of wear and then hold.
            </p>
          </Prose>
        </section>

        <div className="border border-line bg-surface p-6">
          <h2 className="text-xl leading-tight">Send us your measurements</h2>
          <p className="mt-2.5 max-w-lg text-sm leading-relaxed text-content-muted">
            Email your chest, waist or hip measurement and your height, and we will tell you
            which size we would send — and which piece we would pick for your proportions.
            No sales pitch.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <ButtonLink href="/contact" size="md">
              Ask client care
            </ButtonLink>
            <ButtonLink href={`mailto:${site.email}`} variant="outline" size="md">
              Email us directly
            </ButtonLink>
          </div>
        </div>
      </div>
    </ContentPage>
  );
}
