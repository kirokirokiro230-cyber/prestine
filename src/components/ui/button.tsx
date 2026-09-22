import Link from "next/link";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "outline" | "ghost" | "link" | "danger";
type Size = "sm" | "md" | "lg" | "icon";

const BASE =
  "relative inline-flex select-none items-center justify-center gap-2 whitespace-nowrap font-medium transition-[background-color,color,border-color,opacity] duration-200 disabled:pointer-events-none disabled:opacity-45 aria-disabled:pointer-events-none aria-disabled:opacity-45";

/**
 * Variants deliberately change colour and border only — never size or position —
 * so a press never nudges surrounding layout.
 */
const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-inverse text-on-inverse hover:bg-ink-700 dark:hover:bg-bone-300 active:bg-ink-800 dark:active:bg-bone-400",
  secondary:
    "bg-surface-sunken text-content hover:bg-stone-200 dark:hover:bg-ink-700 border border-line",
  outline:
    "border border-ink-900 dark:border-bone-200 text-content hover:bg-inverse hover:text-on-inverse",
  ghost: "text-content hover:bg-surface-sunken",
  link: "link-underline text-content px-0 h-auto",
  danger: "bg-danger-500 text-white hover:bg-danger-700",
};

const SIZES: Record<Size, string> = {
  sm: "h-9 px-4 text-xs tracking-[0.08em] uppercase",
  md: "h-11 px-6 text-xs tracking-[0.1em] uppercase",
  lg: "h-14 px-8 text-sm tracking-[0.1em] uppercase",
  // 44px minimum touch target for icon-only controls.
  icon: "size-11 shrink-0",
};

interface CommonProps {
  variant?: Variant;
  size?: Size;
  /** Stretch to the width of the parent. */
  block?: boolean;
  className?: string;
  children?: React.ReactNode;
}

type ButtonProps = CommonProps &
  Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "className" | "children">;

export function Button({
  variant = "primary",
  size = "md",
  block = false,
  className,
  type = "button",
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        BASE,
        VARIANTS[variant],
        SIZES[size],
        block && "w-full",
        variant !== "link" && "rounded-xs",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

type ButtonLinkProps = CommonProps &
  Omit<React.ComponentPropsWithoutRef<typeof Link>, "className" | "children">;

/** Same visual language as Button, rendered as an anchor for navigation. */
export function ButtonLink({
  variant = "primary",
  size = "md",
  block = false,
  className,
  children,
  ...props
}: ButtonLinkProps) {
  return (
    <Link
      className={cn(
        BASE,
        VARIANTS[variant],
        SIZES[size],
        block && "w-full",
        variant !== "link" && "rounded-xs",
        className,
      )}
      {...props}
    >
      {children}
    </Link>
  );
}

/**
 * Icon-only button. `label` is required and becomes the accessible name — an
 * icon button without one is unusable with a screen reader.
 */
export function IconButton({
  label,
  variant = "ghost",
  className,
  children,
  ...props
}: Omit<ButtonProps, "size" | "children"> & { label: string; children: React.ReactNode }) {
  return (
    <Button
      variant={variant}
      size="icon"
      aria-label={label}
      title={label}
      className={cn("rounded-full", className)}
      {...props}
    >
      {children}
    </Button>
  );
}
