import Link from "next/link";
import { ArrowRight, Check } from "@phosphor-icons/react/dist/ssr";
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

/** Alternating image/copy band used for the craft and materials stories. */
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
          "grid items-stretch gap-5 lg:grid-cols-2",
          reverse && "lg:[&>*:first-child]:order-2",
        )}
      >
        <Reveal className="relative min-h-[24rem] overflow-hidden rounded-[1.75rem] border border-line bg-surface-sunken shadow-md sm:min-h-[34rem]">
          <div className="absolute inset-0">
            {product ? (
              <GarmentArt
                product={product}
                colorHex={product.colors[0].hex}
                colorName={product.colors[0].name}
                view={1}
                texture
                className="transition-transform duration-1000 ease-out hover:scale-[1.025]"
              />
            ) : null}
          </div>
          <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-ink-950/10 to-transparent" />
        </Reveal>

        <Reveal
          delay={80}
          className="flex flex-col justify-center rounded-[1.75rem] border border-line bg-surface px-6 py-10 shadow-sm sm:px-10 sm:py-14 lg:px-14"
        >
          <p className="eyebrow">{eyebrow}</p>
          <h2 className="mt-5 text-4xl leading-[1.02] sm:text-5xl lg:text-[3.4rem]">{title}</h2>

          <div className="mt-7 flex max-w-xl flex-col gap-4">
            {body.map((paragraph) => (
              <p key={paragraph} className="text-sm leading-7 text-content-muted sm:text-base">
                {paragraph}
              </p>
            ))}
          </div>

          {bullets ? (
            <ul className="mt-8 grid gap-x-8 gap-y-3.5 border-t border-line pt-7 sm:grid-cols-2">
              {bullets.map((bullet) => (
                <li key={bullet} className="flex gap-3 text-sm leading-6 text-content-muted">
                  <span aria-hidden className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-accent-soft text-accent">
                    <Check size={11} weight="bold" />
                  </span>
                  {bullet}
                </li>
              ))}
            </ul>
          ) : null}

          <Link
            href={cta.href}
            className="group mt-9 inline-flex w-fit items-center gap-3 rounded-full bg-accent px-6 py-3.5 text-2xs font-semibold uppercase tracking-[0.14em] text-on-accent shadow-sm transition-[background-color,box-shadow] hover:bg-accent-hover hover:shadow-md"
          >
            <span>{cta.label}</span>
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
