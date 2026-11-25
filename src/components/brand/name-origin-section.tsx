import { TurtleMark } from "@/components/brand/brand-mark";
import { Reveal } from "@/components/ui/reveal";
import { cn } from "@/lib/utils";

/** Shared KABUDA name story used on both the homepage and About page. */
export function NameOriginSection({
  className,
  id,
}: {
  className?: string;
  id?: string;
}) {
  return (
    <section
      id={id}
      className={cn("border-y border-line bg-surface-sunken/60", className)}
    >
      <div className="page-gutter mx-auto grid max-w-page items-center gap-12 py-20 lg:grid-cols-[0.75fr_1.25fr] lg:gap-20 lg:py-28">
        <Reveal className="mx-auto w-full max-w-sm">
          <div className="relative aspect-square overflow-hidden rounded-full border border-line bg-canvas shadow-md">
            <div
              aria-hidden
              className="absolute inset-[9%] rounded-full border border-line"
            />
            <div
              aria-hidden
              className="absolute inset-[19%] rounded-full border border-line"
            />
            <TurtleMark
              title="The KABUDA turtle"
              className="absolute inset-1/2 w-[48%] -translate-x-1/2 -translate-y-1/2 text-content"
            />
          </div>
        </Reveal>

        <Reveal delay={90}>
          <p className="eyebrow">Behind the name</p>
          <h2 className="mt-5 text-4xl leading-[1] sm:text-5xl lg:text-6xl">
            Why We&apos;re Called KABUDA
          </h2>
          <div className="mt-7 max-w-2xl space-y-5 text-sm leading-7 text-content-muted sm:text-base">
            <p>
              We believe every brand needs a story behind its name. KABUDA was
              inspired by the turtle — a creature that represents patience and
              tenacity, but also carries a certain sense of style.
            </p>
            <p>
              We wanted our name to reflect those values: pieces made with patience,
              designed to be worn every day, without sacrificing fit or quality.
            </p>
            <p className="font-display text-2xl italic leading-snug text-content sm:text-3xl">
              Take life at your own pace. Know who you are. Embrace it all with style.
            </p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
