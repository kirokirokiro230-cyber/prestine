"use client";

import { useFormStatus } from "react-dom";
import { CircleNotch } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Shared storefront form building blocks.
 *
 * The same shape as `src/components/admin/primitives.tsx`'s `SubmitButton` and
 * `FormFeedback`, kept as a separate copy rather than a shared import: the admin
 * module is scoped to the admin surface and pulling storefront code through it would
 * be the wrong direction of dependency for a boundary that otherwise does not cross.
 */

export function SubmitButton({
  children,
  pendingLabel,
  variant = "primary",
  size = "lg",
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
      block
      disabled={pending || disabled}
      aria-busy={pending}
      className={className}
    >
      {pending ? (
        <>
          <CircleNotch size={14} aria-hidden className="animate-spin" />
          {pendingLabel ?? "Please wait…"}
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
