import Link from "next/link";
import { ArrowUpRight } from "@phosphor-icons/react/dist/ssr";
import { ResponsiveImage } from "@/components/ui/responsive-image";
import { GarmentArt } from "@/components/product/garment-art";
import { Reveal } from "@/components/ui/reveal";
import { allCategories, productsInCategory } from "@/lib/catalog";
import { pluralise } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Category entry points.
 *
 * The first two tiles are given double width on desktop to create a rhythm
 * rather than a flat grid of identical boxes. Empty categories are skipped —
 * a tile reading "0 pieces" is worse than no tile.
 */
export async function CategoryTiles() {
  const categories = await allCategories();

  const entries = (
    await Promise.all(
      categories.map(async (category) => ({
        category,
        items: await productsInCategory(category.slug),
      })),
    )
  ).filter((entry) => entry.items.length > 0);

  return (
    <ul className="grid grid-cols-2 gap-4 sm:gap-5 lg:grid-cols-4">
      {entries.map(({ category, items }, index) => {
        const lead = items[0];
        const featured = index < 2;

        return (
          <Reveal
            as="li"
            key={category.slug}
            delay={index * 60}
            className={cn(featured && "lg:col-span-2")}
          >
            <Link
              href={`/shop/${category.slug}`}
              className="group relative block h-full overflow-hidden rounded-[1.5rem] border border-line bg-surface-sunken shadow-sm transition-[box-shadow,transform] duration-500 hover:-translate-y-1 hover:shadow-lg"
            >
              <div
                className={cn(
                  "relative",
                  featured ? "aspect-4/5 lg:aspect-16/10" : "aspect-4/5",
                )}
              >
                {/*
                  Photography when the merchant has uploaded it, generated artwork from
                  the lead product otherwise. The fallback is what makes the image
                  optional: a category with no photograph is still a finished-looking
                  tile rather than an empty box, so a merchant can add images one at a
                  time instead of all at once.

                  Rendered through `ResponsiveImage`, not `next/image`. The admin accepts
                  any absolute https URL, and `next/image` throws a hard runtime error —
                  not a broken image, an error page — for any host missing from
                  `remotePatterns`. Pasting a URL into a text field should never be able
                  to take the home page down, and a merchant cannot edit `next.config.ts`.
                */}
                {category.imageUrl ? (
                  <ResponsiveImage
                    /*
                      Featured tiles are 4:5 up to `lg` and 16:10 above it, so they are
                      the only ones that need two crops. `src` is the `lg`-and-up file —
                      `ResponsiveImage`'s plain `<img>` is the widest branch — and the
                      portrait original is pinned to mobile and tablet.

                      Non-featured tiles stay 4:5 at every width, so they get one source
                      and the browser fetches one file, exactly as before.
                    */
                    src={featured ? (category.imageUrlWide ?? category.imageUrl) : category.imageUrl}
                    tabletSrc={featured && category.imageUrlWide ? category.imageUrl : undefined}
                    mobileSrc={featured && category.imageUrlWide ? category.imageUrl : undefined}
                    alt={category.name}
                    className="size-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.03]"
                  />
                ) : lead ? (
                  <GarmentArt
                    product={lead}
                    colorHex={lead.colors[0].hex}
                    colorName={lead.colors[0].name}
                    view={featured ? 3 : 0}
                    className="transition-transform duration-700 ease-out group-hover:scale-[1.03]"
                  />
                ) : null}

                {/* Legibility scrim — strong enough for text in both themes. */}
                <div
                  aria-hidden
                  className="absolute inset-0 bg-gradient-to-t from-ink-950/80 via-ink-950/10 to-transparent transition-colors duration-500 group-hover:from-ink-950/90"
                />
              </div>

              <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-4 sm:p-5">
                <div className="min-w-0">
                  <h3 className="font-display text-xl leading-tight text-bone-100 sm:text-2xl">
                    {category.name}
                  </h3>
                  <p className="mt-1 text-2xs uppercase tracking-[0.12em] text-bone-100/70">
                    {pluralise(items.length, "piece")}
                  </p>
                  {featured ? (
                    <p className="mt-2 hidden max-w-sm text-sm leading-relaxed text-bone-100/80 lg:block">
                      {category.blurb}
                    </p>
                  ) : null}
                </div>

                <span
                  aria-hidden
                  className="grid size-9 shrink-0 place-items-center rounded-full bg-bone-100/15 text-bone-100 backdrop-blur-sm transition-colors group-hover:bg-bone-100 group-hover:text-ink-950"
                >
                  <ArrowUpRight size={15} />
                </span>
              </div>
            </Link>
          </Reveal>
        );
      })}
    </ul>
  );
}
