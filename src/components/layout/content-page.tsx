import { Breadcrumbs, type Crumb } from "@/components/ui/breadcrumbs";
import { cn } from "@/lib/utils";

/**
 * Shell for editorial, support and legal pages.
 *
 * Measure is capped at 68 characters via `max-w-2xl` on the body, which is the
 * range long-form text stays comfortable to read.
 */
export function ContentPage({
  eyebrow,
  title,
  lede,
  breadcrumbs,
  updated,
  children,
  wide = false,
}: {
  eyebrow?: string;
  title: string;
  lede?: string;
  breadcrumbs: Crumb[];
  /** ISO date shown as "Last updated" — expected on legal pages. */
  updated?: string;
  children: React.ReactNode;
  /** Allow a wider column for pages with tables or grids. */
  wide?: boolean;
}) {
  return (
    <div className="page-gutter mx-auto max-w-page py-8 lg:py-12">
      <Breadcrumbs items={breadcrumbs} className="mb-6" />

      <header className="max-w-3xl">
        {eyebrow ? <p className="eyebrow mb-3">{eyebrow}</p> : null}
        <h1 className="text-4xl leading-[1.05] sm:text-5xl lg:text-6xl">{title}</h1>
        {lede ? (
          <p className="mt-5 text-base leading-relaxed text-content-muted sm:text-lg">
            {lede}
          </p>
        ) : null}
        {updated ? (
          <p className="mt-6 text-xs text-content-subtle">Last updated {updated}</p>
        ) : null}
      </header>

      <div className={cn("mt-12", wide ? "max-w-4xl" : "max-w-2xl")}>{children}</div>
    </div>
  );
}

/** Typographic defaults for prose blocks. Avoids a plugin dependency. */
export function Prose({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "flex flex-col gap-5 text-sm leading-relaxed text-content-muted sm:text-base",
        "[&_a]:text-content [&_a]:underline [&_a]:underline-offset-4 [&_a:hover]:text-accent",
        "[&_h2]:mt-6 [&_h2]:text-2xl [&_h2]:leading-tight [&_h2]:text-content",
        "[&_h3]:mt-4 [&_h3]:font-sans [&_h3]:text-2xs [&_h3]:font-medium [&_h3]:uppercase [&_h3]:tracking-[0.12em] [&_h3]:text-content",
        "[&_strong]:font-medium [&_strong]:text-content",
        "[&_ul]:flex [&_ul]:flex-col [&_ul]:gap-2.5 [&_ul]:pl-0",
        "[&_li]:relative [&_li]:pl-5",
        "[&_li]:before:absolute [&_li]:before:left-0 [&_li]:before:top-[0.6em] [&_li]:before:size-1 [&_li]:before:rounded-full [&_li]:before:bg-accent",
        "[&_ol]:flex [&_ol]:list-decimal [&_ol]:flex-col [&_ol]:gap-2.5 [&_ol]:pl-5",
        "[&_ol>li]:pl-0 [&_ol>li]:before:hidden",
        className,
      )}
    >
      {children}
    </div>
  );
}
