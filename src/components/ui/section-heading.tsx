import Link from "next/link";
import { ArrowRight } from "@phosphor-icons/react/dist/ssr";
import { cn } from "@/lib/utils";

interface SectionHeadingProps {
  eyebrow?: string;
  title: string;
  description?: string;
  /** Optional "View all" link on the right. */
  action?: { label: string; href: string };
  align?: "left" | "center";
  /** Heading level — pages should only ever have one h1. */
  as?: "h1" | "h2" | "h3";
  className?: string;
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  action,
  align = "left",
  as: Tag = "h2",
  className,
}: SectionHeadingProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between",
        align === "center" && "sm:flex-col sm:items-center sm:text-center",
        className,
      )}
    >
      <div className={cn("max-w-3xl", align === "center" && "mx-auto")}>
        {eyebrow ? <p className="eyebrow mb-4">{eyebrow}</p> : null}
        <Tag
          className={cn(
            "text-balance font-display font-medium tracking-[-0.035em]",
            Tag === "h1"
              ? "text-5xl leading-[0.98] sm:text-6xl lg:text-7xl"
              : "text-4xl leading-[1.02] sm:text-5xl lg:text-[3.5rem]",
          )}
        >
          {title}
        </Tag>
        {description ? (
          <p className="mt-5 max-w-2xl text-sm leading-7 text-content-muted sm:text-base">
            {description}
          </p>
        ) : null}
      </div>

      {action ? (
        <Link
          href={action.href}
          className="group inline-flex h-11 shrink-0 items-center gap-3 rounded-full border border-line-strong bg-surface/75 px-5 text-2xs font-semibold uppercase tracking-[0.14em] text-content shadow-xs backdrop-blur-sm transition-[border-color,background-color,color,box-shadow] hover:border-accent hover:bg-accent-soft hover:text-accent hover:shadow-sm"
        >
          <span>{action.label}</span>
          <ArrowRight
            size={13}
            aria-hidden
            className="transition-transform duration-300 group-hover:translate-x-1"
          />
        </Link>
      ) : null}
    </div>
  );
}
