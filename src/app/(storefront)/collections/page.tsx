import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight } from "@phosphor-icons/react/dist/ssr";
import { GarmentArt } from "@/components/product/garment-art";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Reveal } from "@/components/ui/reveal";
import { navCollections, productsInCollection } from "@/lib/catalog";
import { pluralise } from "@/lib/format";

export const metadata: Metadata = {
  title: "Collections",
  description:
    "Curated edits from the PRESTINE range — new arrivals, the permanent Essentials collection, tailoring, autumn/winter and the archive sale.",
  alternates: { canonical: "/collections" },
};

export default async function CollectionsPage() {
  const collections = await navCollections();

  // One pass over the catalogue per collection, resolved together rather than in
  // sequence so the page does not serialise a request per card.
  const entries = await Promise.all(
    collections.map(async (collection) => ({
      collection,
      items: await productsInCollection(collection.slug),
    })),
  );

  return (
    <div className="page-gutter mx-auto max-w-page py-8 lg:py-12">
      <Breadcrumbs
        items={[{ label: "Home", href: "/" }, { label: "Collections" }]}
        className="mb-6"
      />

      <header className="max-w-2xl">
        <p className="eyebrow mb-3">Edits</p>
        <h1 className="text-4xl leading-[1.05] sm:text-5xl">Collections</h1>
        <p className="mt-4 text-sm leading-relaxed text-content-muted sm:text-base">
          Several ways into the same small range. The Essentials never change;
          everything else moves with the season.
        </p>
      </header>

      <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:gap-6">
        {entries.map(({ collection, items }, index) => {
          const lead = items[0];

          return (
            <Reveal as="li" key={collection.slug} delay={index * 70}>
              <Link
                href={`/collections/${collection.slug}`}
                className="group relative block overflow-hidden bg-surface-sunken"
              >
                <div className="relative aspect-16/11">
                  {lead ? (
                    <GarmentArt
                      product={lead}
                      colorHex={lead.colors[0].hex}
                      colorName={lead.colors[0].name}
                      view={index % 2 === 0 ? 3 : 0}
                      className="transition-transform duration-700 ease-out group-hover:scale-[1.03]"
                    />
                  ) : null}
                  <div
                    aria-hidden
                    className="absolute inset-0 bg-gradient-to-t from-ink-950/78 via-ink-950/20 to-transparent"
                  />
                </div>

                <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-4 p-5 sm:p-6">
                  <div className="min-w-0">
                    <p className="text-2xs uppercase tracking-[0.14em] text-bone-100/70">
                      {pluralise(items.length, "piece")}
                    </p>
                    <h2 className="mt-1.5 font-display text-2xl leading-tight text-bone-100 sm:text-3xl">
                      {collection.name}
                    </h2>
                    <p className="mt-2 max-w-sm text-sm leading-relaxed text-bone-100/80">
                      {collection.blurb}
                    </p>
                  </div>

                  <span
                    aria-hidden
                    className="grid size-10 shrink-0 place-items-center rounded-full bg-bone-100/15 text-bone-100 backdrop-blur-sm transition-colors group-hover:bg-bone-100 group-hover:text-ink-950"
                  >
                    <ArrowUpRight size={16} />
                  </span>
                </div>
              </Link>
            </Reveal>
          );
        })}
      </ul>
    </div>
  );
}
