import Link from "next/link";
import { ArrowRight } from "@phosphor-icons/react/dist/ssr";
import { GarmentArt } from "@/components/product/garment-art";
import { Reveal } from "@/components/ui/reveal";
import { getProductBySlug } from "@/lib/catalog";
import { cn } from "@/lib/utils";

interface EditorialSplitProps {
  eyebrow: string;
  title: string;
  body: string[];
  bullets?: string[];
  cta: { label: string; href: string };
  /** Product whose generated art illustrates the section. */
  productSlug: string;
  /** Put the image on the left instead of the right. */
  reverse?: boolean;
  className?: string;
}

/**
 * Alternating image/copy band used for the craft and materials stories. Reads as
 * editorial rather than marketing because the copy is specific — fabric weights,
 * mill locations, construction methods.
 */
export async function EditorialSplit({
  eyebrow,
  title,
  body,
  bullets,
  cta,
  productSlug,
  reverse = false,
  className,
}: EditorialSplitProps) {
  const product = await getProductBySlug(productSlug);

  return (
    <section className={cn("page-gutter mx-auto max-w-page", className)}>
      <div
        className={cn(
          "grid items-center gap-10 lg:grid-cols-2 lg:gap-16",
          reverse && "lg:[&>*:first-child]:order-2",
        )}
      >
        <Reveal className="relative overflow-hidden bg-surface-sunken">
          <div className="relative aspect-4/3 lg:aspect-4/5">
            {product ? (
              <GarmentArt
                product={product}
                colorHex={product.colors[0].hex}
                colorName={product.colors[0].name}
                view={1}
                texture
              />
            ) : null}
          </div>
        </Reveal>

        <Reveal delay={80}>
          <p className="eyebrow">{eyebrow}</p>
          <h2 className="mt-4 text-3xl leading-[1.1] sm:text-4xl lg:text-[2.75rem]">{title}</h2>

          <div className="mt-6 flex flex-col gap-4">
            {body.map((paragraph) => (
              <p key={paragraph} className="text-sm leading-relaxed text-content-muted sm:text-base">
                {paragraph}
              </p>
            ))}
          </div>

          {bullets ? (
            <ul className="mt-8 grid gap-x-8 gap-y-3 border-t border-line pt-8 sm:grid-cols-2">
              {bullets.map((bullet) => (
                <li key={bullet} className="flex gap-3 text-sm text-content-muted">
                  <span aria-hidden className="mt-2 size-1 shrink-0 rounded-full bg-accent" />
                  {bullet}
                </li>
              ))}
            </ul>
          ) : null}

          <Link
            href={cta.href}
            className="group mt-9 inline-flex items-center gap-2 text-2xs font-medium uppercase tracking-[0.14em] text-content"
          >
            <span className="link-underline">{cta.label}</span>
            <ArrowRight
              size={13}
              aria-hidden
              className="transition-transform duration-300 group-hover:translate-x-1"
            />
          </Link>
        </Reveal>
      </div>
    </section>
  );
}
