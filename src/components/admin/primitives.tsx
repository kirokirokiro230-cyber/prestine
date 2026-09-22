"use client";

import { useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { CircleNotch, TrendDown, TrendUp } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Shared admin building blocks.
 *
 * The admin surface is denser than the storefront but uses the same semantic
 * tokens, so it inherits light and dark themes with no extra work.
 */

/**
 * Submit button wired to the enclosing form's pending state.
 *
 * `useFormStatus` means no component has to thread a loading boolean through
 * props, and the button disables itself during submission so a double-click cannot
 * create two products.
 */
export function SubmitButton({
  children,
  pendingLabel,
  variant = "primary",
  size = "md",
  className,
  disabled,
}: {
  children: React.ReactNode;
  pendingLabel?: string;
  variant?: "primary" | "secondary" | "outline" | "danger" | "ghost";
  size?: "sm" | "md" | "lg";
  className?: string;
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      variant={variant}
      size={size}
      disabled={pending || disabled}
      aria-busy={pending}
      className={className}
    >
      {pending ? (
        <>
          <CircleNotch size={14} aria-hidden className="animate-spin" />
          {pendingLabel ?? "Saving…"}
        </>
      ) : (
        children
      )}
    </Button>
  );
}

/** Result banner for a submitted form. Announced, not just coloured. */
export function FormFeedback({
  error,
  success,
  className,
}: {
  error?: string | null;
  success?: string | null;
  className?: string;
}) {
  if (!error && !success) return null;

  return (
    <p
      role={error ? "alert" : "status"}
      className={cn(
        "border px-3 py-2.5 text-sm",
        error
          ? "border-danger-500/40 bg-danger-100/60 text-danger-700 dark:bg-danger-700/20 dark:text-danger-100"
          : "border-success-500/40 bg-success-100/60 text-success-700 dark:bg-success-700/20 dark:text-success-100",
        className,
      )}
    >
      {error ?? success}
    </p>
  );
}

/** Dashboard metric tile with an optional period-over-period delta. */
export function StatCard({
  label,
  value,
  change,
  hint,
  href,
}: {
  label: string;
  value: string;
  /** Percentage change. Null renders no comparison rather than a misleading 0%. */
  change?: number | null;
  hint?: string;
  href?: string;
}) {
  const positive = typeof change === "number" && change > 0;
  const negative = typeof change === "number" && change < 0;

  const body = (
    <>
      <p className="text-2xs font-medium uppercase tracking-[0.12em] text-content-muted">
        {label}
      </p>
      <p data-numeric className="mt-3 font-display text-3xl leading-none">
        {value}
      </p>

      <div className="mt-3 flex items-center gap-2 text-xs">
        {typeof change === "number" ? (
          <span
            className={cn(
              "inline-flex items-center gap-1",
              positive && "text-success-700 dark:text-success-500",
              negative && "text-danger-500 dark:text-danger-100",
              !positive && !negative && "text-content-muted",
            )}
          >
            {positive ? (
              <TrendUp size={13} aria-hidden />
            ) : negative ? (
              <TrendDown size={13} aria-hidden />
            ) : null}
            <span data-numeric>
              {change > 0 ? "+" : ""}
              {change}%
            </span>
          </span>
        ) : (
          <span className="text-content-subtle">No prior period</span>
        )}
        {hint ? <span className="text-content-subtle">{hint}</span> : null}
      </div>
    </>
  );

  if (href) {
    return (
      <a
        href={href}
        className="block border border-line bg-surface p-5 transition-colors hover:border-line-strong"
      >
        {body}
      </a>
    );
  }

  return <div className="border border-line bg-surface p-5">{body}</div>;
}

/** Section heading inside an admin page. */
export function Panel({
  title,
  description,
  action,
  children,
  className,
  bodyClassName,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cn("border border-line bg-surface", className)}>
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
        <div className="min-w-0">
          <h2 className="font-sans text-sm font-medium">{title}</h2>
          {description ? (
            <p className="mt-1 text-xs leading-relaxed text-content-muted">{description}</p>
          ) : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </header>
      <div className={cn("px-5 py-5", bodyClassName)}>{children}</div>
    </section>
  );
}

/** Publication and order status pill, with a fixed colour per state. */
export function StatusPill({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  const tone: Record<string, string> = {
    active: "bg-success-100 text-success-700 dark:bg-success-700/25 dark:text-success-100",
    draft: "bg-surface-sunken text-content-muted",
    archived: "bg-ink-200 text-ink-700 dark:bg-ink-700 dark:text-ink-100",
    processing: "bg-warning-100 text-warning-700 dark:bg-warning-700/25 dark:text-warning-100",
    shipped: "bg-clay-100 text-clay-700 dark:bg-clay-900/60 dark:text-clay-200",
    delivered: "bg-success-100 text-success-700 dark:bg-success-700/25 dark:text-success-100",
    cancelled: "bg-danger-100 text-danger-700 dark:bg-danger-700/25 dark:text-danger-100",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap px-2 py-1 text-2xs font-medium uppercase tracking-[0.08em] leading-none",
        tone[status] ?? "bg-surface-sunken text-content-muted",
        className,
      )}
    >
      {status}
    </span>
  );
}

/**
 * Destructive action with a two-step confirmation.
 *
 * Deletes are irreversible here, so the first click arms the button and the second
 * submits. Cheaper than a modal and impossible to trigger by accident.
 */
export function ConfirmSubmit({
  children,
  confirmLabel = "Click again to confirm",
  className,
}: {
  children: React.ReactNode;
  confirmLabel?: string;
  className?: string;
}) {
  return (
    <ArmedButton confirmLabel={confirmLabel} className={className}>
      {children}
    </ArmedButton>
  );
}

function ArmedButton({
  children,
  confirmLabel,
  className,
}: {
  children: React.ReactNode;
  confirmLabel: string;
  className?: string;
}) {
  const { pending } = useFormStatus();
  const [armed, setArmed] = useArmedState();

  if (pending) {
    return (
      <Button type="submit" variant="danger" size="sm" disabled aria-busy className={className}>
        <CircleNotch size={13} aria-hidden className="animate-spin" />
        Working…
      </Button>
    );
  }

  return (
    <Button
      type={armed ? "submit" : "button"}
      variant={armed ? "danger" : "outline"}
      size="sm"
      onClick={() => {
        if (!armed) setArmed(true);
      }}
      className={className}
    >
      {armed ? confirmLabel : children}
    </Button>
  );
}

/**
 * Armed flag for the two-step delete, which disarms itself after a few seconds so a
 * button left armed on screen cannot be triggered later by a stray click.
 */
function useArmedState(): [boolean, (value: boolean) => void] {
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!armed) return;
    const timer = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(timer);
  }, [armed]);

  return [armed, setArmed];
}
