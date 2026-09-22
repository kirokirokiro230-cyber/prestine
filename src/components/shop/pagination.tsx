import Link from "next/link";
import { CaretLeft, CaretRight } from "@phosphor-icons/react/dist/ssr";
import { cn } from "@/lib/utils";

interface PaginationProps {
  page: number;
  totalPages: number;
  /** Builds the href for a given page number. */
  hrefFor: (page: number) => string;
}

/**
 * Page links, rendered as real anchors so they are crawlable and work without
 * JavaScript. Uses a windowed range with ellipses rather than printing every page.
 */
export function Pagination({ page, totalPages, hrefFor }: PaginationProps) {
  if (totalPages <= 1) return null;

  const pages = pageWindow(page, totalPages);

  return (
    <nav aria-label="Pagination" className="flex items-center justify-center gap-1 pt-4">
      <PageArrow
        href={page > 1 ? hrefFor(page - 1) : undefined}
        label="Previous page"
        icon={<CaretLeft size={13} aria-hidden />}
      />

      <ul className="flex items-center gap-1">
        {pages.map((entry, index) =>
          entry === "ellipsis" ? (
            <li
              key={`gap-${index}`}
              aria-hidden
              className="grid size-11 place-items-center text-xs text-content-subtle"
            >
              …
            </li>
          ) : (
            <li key={entry}>
              <Link
                href={hrefFor(entry)}
                aria-current={entry === page ? "page" : undefined}
                aria-label={`Page ${entry}`}
                scroll
                className={cn(
                  "grid size-11 place-items-center text-xs transition-colors",
                  entry === page
                    ? "bg-inverse text-on-inverse"
                    : "text-content-muted hover:bg-surface-sunken hover:text-content",
                )}
              >
                <span data-numeric>{entry}</span>
              </Link>
            </li>
          ),
        )}
      </ul>

      <PageArrow
        href={page < totalPages ? hrefFor(page + 1) : undefined}
        label="Next page"
        icon={<CaretRight size={13} aria-hidden />}
      />
    </nav>
  );
}

function PageArrow({
  href,
  label,
  icon,
}: {
  href?: string;
  label: string;
  icon: React.ReactNode;
}) {
  if (!href) {
    return (
      <span
        aria-hidden
        className="grid size-11 place-items-center text-content-subtle opacity-40"
      >
        {icon}
      </span>
    );
  }

  return (
    <Link
      href={href}
      aria-label={label}
      scroll
      className="grid size-11 place-items-center text-content transition-colors hover:bg-surface-sunken"
    >
      {icon}
    </Link>
  );
}

/** 1 … 4 5 [6] 7 8 … 20 */
function pageWindow(page: number, total: number): Array<number | "ellipsis"> {
  const span = 1;
  const range: Array<number | "ellipsis"> = [];
  const start = Math.max(2, page - span);
  const end = Math.min(total - 1, page + span);

  range.push(1);
  if (start > 2) range.push("ellipsis");
  for (let i = start; i <= end; i += 1) range.push(i);
  if (end < total - 1) range.push("ellipsis");
  if (total > 1) range.push(total);

  return range;
}
