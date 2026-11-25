import Link from "next/link";
import { CaretRight } from "@phosphor-icons/react/dist/ssr";
import { cn } from "@/lib/utils";

export interface Crumb {
  label: string;
  href?: string;
}

/**
 * Breadcrumb trail. Uses an ordered list inside `nav` and marks the final item
 * with `aria-current="page"`, which is what screen readers rely on to announce
 * position.
 */
export function Breadcrumbs({ items, className }: { items: Crumb[]; className?: string }) {
  return (
    <nav aria-label="Breadcrumb" className={cn("text-2xs font-medium uppercase tracking-[0.12em]", className)}>
      <ol className="flex flex-wrap items-center gap-1.5 text-content-muted">
        {items.map((item, index) => {
          const last = index === items.length - 1;
          return (
            <li key={`${item.label}-${index}`} className="flex items-center gap-1.5">
              {item.href && !last ? (
                <Link href={item.href} className="link-underline transition-colors hover:text-content">
                  {item.label}
                </Link>
              ) : (
                <span aria-current={last ? "page" : undefined} className={last ? "text-content" : undefined}>
                  {item.label}
                </span>
              )}
              {!last ? (
                <CaretRight size={10} aria-hidden className="text-content-subtle" />
              ) : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
