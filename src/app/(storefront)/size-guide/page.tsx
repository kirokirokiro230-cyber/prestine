import type { Metadata } from "next";
import { ContentPage, Prose } from "@/components/layout/content-page";
import { ButtonLink } from "@/components/ui/button";
import { site, sizeGuides } from "@/lib/config";

export const metadata: Metadata = {
  title: "Size guide",
  description:
    "Body measurements for PRESTINE tops, knitwear, outerwear, trousers and denim, plus how to measure yourself accurately.",
  alternates: { canonical: "/size-guide" },
};

const GUIDES = [sizeGuides.alpha, sizeGuides.waist];

export default function SizeGuidePage() {
  return (
    <ContentPage
      eyebrow="Fit"
      title="Size guide"
      lede="All figures are body measurements in inches, not garment measurements. Measure over a thin layer, keeping the tape level and snug but not tight."
      breadcrumbs={[{ label: "Home", href: "/" }, { label: "Size guide" }]}
      wide
    >
      <div className="flex flex-col gap-14">
        {GUIDES.map((guide) => (
          <section key={guide.label}>
            <h2 className="mb-5 text-2xl leading-tight">{guide.label}</h2>

            <div className="overflow-x-auto">
              <table className="w-full min-w-md border-collapse text-sm">
                <caption className="sr-only">
                  {guide.label} — body measurements in inches
                </caption>
                <thead>
                  <tr className="border-b border-line-strong">
                    {guide.columns.map((column) => (
                      <th
                        key={column}
                        scope="col"
                        className="whitespace-nowrap px-3 py-3 text-left text-2xs font-medium uppercase tracking-[0.1em] text-content-muted"
                      >
                        {column}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {guide.rows.map((row) => (
                    <tr key={row[0]} className="border-b border-line last:border-0">
                      {row.map((cell, index) =>
                        index === 0 ? (
                          <th
                            key={cell}
                            scope="row"
                            className="whitespace-nowrap px-3 py-3.5 text-left font-medium text-content"
                          >
                            {cell}
                          </th>
                        ) : (
                          <td
                            key={`${row[0]}-${index}`}
                            data-numeric
                            className="whitespace-nowrap px-3 py-3.5 text-content-muted"
                          >
                            {cell}
                          </td>
                        ),
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))}

        <section>
          <h2 className="mb-5 text-2xl leading-tight">How to measure</h2>
          <Prose>
            <ul>
              <li>
                <strong>Chest</strong> — around the fullest part, under the arms, tape level
                across the back.
              </li>
              <li>
                <strong>Waist</strong> — at your natural waist, the narrowest point, usually
                just above the navel.
              </li>
              <li>
                <strong>Hip</strong> — around the fullest part, roughly 8&quot; below the
                natural waist.
              </li>
              <li>
                <strong>Sleeve</strong> — from the centre back of the neck, over the
                shoulder, to the wrist bone with a slight bend in the elbow.
              </li>
              <li>
                <strong>Inseam</strong> — from the crotch seam to the hem of a trouser that
                already fits you the way you like.
              </li>
            </ul>
          </Prose>
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
