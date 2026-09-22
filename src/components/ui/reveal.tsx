"use client";

import { useInView } from "@/hooks/use-ui";
import { cn } from "@/lib/utils";

type RevealTag = "div" | "section" | "li" | "article" | "header";

interface RevealProps {
  children: React.ReactNode;
  /** Stagger in milliseconds. */
  delay?: number;
  as?: RevealTag;
  className?: string;
}

/**
 * Fades content up as it scrolls into view, once. Honours
 * `prefers-reduced-motion` via `useInView`, which reveals immediately when the
 * user has asked for less motion.
 */
export function Reveal({ children, delay = 0, as = "div", className }: RevealProps) {
  const [ref, inView] = useInView<HTMLElement>();

  // Widened to ElementType so one component can render any of the allowed tags;
  // each has a different ref element type, which a union of intrinsic props
  // cannot express.
  const Tag = as as React.ElementType;

  return (
    <Tag
      ref={ref}
      style={inView && delay ? { animationDelay: `${delay}ms` } : undefined}
      className={cn(
        inView ? "animate-fade-up" : "opacity-0",
        // Keep content readable if JS fails: no-JS users get the fallback below.
        "motion-reduce:animate-none motion-reduce:opacity-100",
        className,
      )}
    >
      {children}
    </Tag>
  );
}
