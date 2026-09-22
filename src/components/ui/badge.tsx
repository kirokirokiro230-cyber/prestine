import { cn } from "@/lib/utils";

/**
 * `muted` was `sold-out` until inventory was removed. It is now the greyed-out tone for
 * anything inactive — a cancelled order, for instance — and named for what it looks like
 * rather than the one state that used to use it.
 */
type Tone = "neutral" | "sale" | "new" | "muted" | "eco" | "accent";

const TONES: Record<Tone, string> = {
  neutral: "bg-surface text-content border-line",
  sale: "bg-danger-500 text-white border-transparent",
  new: "bg-inverse text-on-inverse border-transparent",
  muted: "bg-surface-sunken text-content-muted border-line",
  eco: "bg-moss-100 text-moss-700 border-transparent dark:bg-moss-900/60 dark:text-moss-100",
  accent: "bg-accent-soft text-accent border-transparent",
};

export function Badge({
  tone = "neutral",
  className,
  children,
}: {
  tone?: Tone;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 border px-2 py-1 text-2xs font-medium uppercase tracking-[0.1em] leading-none",
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
