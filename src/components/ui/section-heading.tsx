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
        "flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between",
        align === "center" && "sm:flex-col sm:items-center sm:text-center",
        className,
      )}
    >
      <div className={cn("max-w-2xl", align === "center" && "mx-auto")}>
        {eyebrow ? <p className="eyebrow mb-3">{eyebrow}</p> : null}
        <Tag
          className={cn(
            "text-balance",
            Tag === "h1"
              ? "text-4xl leading-[1.05] sm:text-5xl lg:text-6xl"
              : "text-2xl leading-[1.1] sm:text-3xl lg:text-4xl",
          )}
        >
          {title}
        </Tag>
        {description ? (
          <p className="mt-4 text-sm leading-relaxed text-content-muted sm:text-base">
            {description}
          </p>
        ) : null}
      </div>

      {action ? (
        <Link
          href={action.href}
          className="group inline-flex shrink-0 items-center gap-2 text-2xs font-medium uppercase tracking-[0.14em] text-content transition-colors hover:text-accent"
        >
          <span className="link-underline">{action.label}</span>
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
