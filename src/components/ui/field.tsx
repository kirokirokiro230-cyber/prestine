"use client";

import { useId } from "react";
import { WarningCircle } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

/**
 * Shared control surface.
 *
 * Exported so `select.tsx` can build a custom listbox trigger that is visually identical
 * to a text input — a select that is a few pixels taller than the field beside it is the
 * usual giveaway that a component was replaced rather than designed.
 */
export const CONTROL =
  "w-full rounded-xl border bg-surface px-4 py-3.5 text-sm text-content shadow-xs placeholder:text-content-subtle transition-[border-color,background-color,box-shadow] duration-200 hover:border-line-strong focus:border-accent focus:bg-surface-raised focus:outline-none focus-visible:outline-none focus:shadow-md disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:text-content-subtle";

interface FieldShellProps {
  label: string;
  htmlFor: string;
  hint?: string;
  error?: string;
  required?: boolean;
  /** Visually hide the label but keep it for assistive tech. */
  hideLabel?: boolean;
  className?: string;
  children: React.ReactNode;
}

/**
 * Shared label / hint / error scaffolding.
 *
 * Errors are wired with `aria-describedby` and announced via `role="alert"`, and
 * the required marker is duplicated as screen-reader text rather than relying on
 * the asterisk glyph alone.
 */
export function FieldShell({
  label,
  htmlFor,
  hint,
  error,
  required,
  hideLabel,
  className,
  children,
}: FieldShellProps) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label
        htmlFor={htmlFor}
        className={cn(
          "text-2xs font-medium uppercase tracking-[0.12em] text-content-muted",
          hideLabel && "sr-only",
        )}
      >
        {label}
        {required ? (
          <>
            <span aria-hidden className="ml-1 text-danger-500 dark:text-danger-100">
              *
            </span>
            <span className="sr-only"> (required)</span>
          </>
        ) : null}
      </label>

      {children}

      {hint && !error ? (
        <p id={`${htmlFor}-hint`} className="text-xs text-content-subtle">
          {hint}
        </p>
      ) : null}

      {error ? (
        <p
          id={`${htmlFor}-error`}
          role="alert"
          className="flex items-center gap-1.5 text-xs text-danger-500 dark:text-danger-100"
        >
          <WarningCircle size={14} weight="fill" aria-hidden className="shrink-0" />
          {error}
        </p>
      ) : null}
    </div>
  );
}

type InputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "className" | "id"> & {
  label: string;
  hint?: string;
  error?: string;
  hideLabel?: boolean;
  className?: string;
  id?: string;
};

export function TextField({
  label,
  hint,
  error,
  hideLabel,
  className,
  id,
  required,
  ...props
}: InputProps) {
  const generated = useId();
  const fieldId = id ?? generated;

  return (
    <FieldShell
      label={label}
      htmlFor={fieldId}
      hint={hint}
      error={error}
      required={required}
      hideLabel={hideLabel}
      className={className}
    >
      <input
        id={fieldId}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${fieldId}-error` : hint ? `${fieldId}-hint` : undefined}
        className={cn(CONTROL, error ? "border-danger-500" : "border-line-strong")}
        {...props}
      />
    </FieldShell>
  );
}

type TextAreaProps = Omit<
  React.TextareaHTMLAttributes<HTMLTextAreaElement>,
  "className" | "id"
> & {
  label: string;
  hint?: string;
  error?: string;
  hideLabel?: boolean;
  className?: string;
  id?: string;
};

export function TextArea({
  label,
  hint,
  error,
  hideLabel,
  className,
  id,
  required,
  rows = 5,
  ...props
}: TextAreaProps) {
  const generated = useId();
  const fieldId = id ?? generated;

  return (
    <FieldShell
      label={label}
      htmlFor={fieldId}
      hint={hint}
      error={error}
      required={required}
      hideLabel={hideLabel}
      className={className}
    >
      <textarea
        id={fieldId}
        rows={rows}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${fieldId}-error` : hint ? `${fieldId}-hint` : undefined}
        className={cn(CONTROL, "resize-y", error ? "border-danger-500" : "border-line-strong")}
        {...props}
      />
    </FieldShell>
  );
}

/*
 * `SelectField` lives in `./select`, which replaces the native `<select>` with a themed
 * listbox — the OS draws a native option list and no stylesheet can reach it.
 *
 * Re-exported from here so the twelve existing call sites keep importing from
 * `@/components/ui/field` unchanged.
 */
export { SelectField, type SelectFieldProps, type SelectOption } from "./select";

interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "className"> {
  label: React.ReactNode;
  hint?: string;
  className?: string;
}

export function Checkbox({ label, hint, className, id, ...props }: CheckboxProps) {
  const generated = useId();
  const fieldId = id ?? generated;

  return (
    <div className={cn("flex items-start gap-3", className)}>
      <input
        type="checkbox"
        id={fieldId}
        aria-describedby={hint ? `${fieldId}-hint` : undefined}
        className="mt-0.5 size-4 shrink-0 cursor-pointer appearance-none border border-line-strong bg-surface transition-colors checked:border-inverse checked:bg-inverse checked:bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 16 16%22 fill=%22none%22 stroke=%22white%22 stroke-width=%222.5%22 stroke-linecap=%22round%22 stroke-linejoin=%22round%22><path d=%22M3 8.5 6.5 12 13 4.5%22/></svg>')] checked:bg-center checked:bg-no-repeat dark:checked:bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 16 16%22 fill=%22none%22 stroke=%22black%22 stroke-width=%222.5%22 stroke-linecap=%22round%22 stroke-linejoin=%22round%22><path d=%22M3 8.5 6.5 12 13 4.5%22/></svg>')]"
        {...props}
      />
      <div className="min-w-0">
        <label htmlFor={fieldId} className="cursor-pointer text-sm text-content">
          {label}
        </label>
        {hint ? (
          <p id={`${fieldId}-hint`} className="mt-0.5 text-xs text-content-subtle">
            {hint}
          </p>
        ) : null}
      </div>
    </div>
  );
}

interface RadioProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "className"> {
  label: React.ReactNode;
  description?: React.ReactNode;
  /** Right-aligned content, e.g. a price. */
  trailing?: React.ReactNode;
  className?: string;
}

/** Card-style radio used for shipping and payment selection. */
export function RadioCard({
  label,
  description,
  trailing,
  className,
  id,
  ...props
}: RadioProps) {
  const generated = useId();
  const fieldId = id ?? generated;

  return (
    <label
      htmlFor={fieldId}
      className={cn(
        "flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-[border-color,background-color,box-shadow]",
        "border-line-strong bg-surface shadow-xs has-checked:border-accent has-checked:bg-accent-soft has-checked:shadow-sm",
        "has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-focus",
        className,
      )}
    >
      <input
        type="radio"
        id={fieldId}
        className="mt-0.5 size-4 shrink-0 cursor-pointer appearance-none rounded-full border border-line-strong bg-surface transition-colors checked:border-[5px] checked:border-accent"
        {...props}
      />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-content">{label}</span>
        {description ? (
          <span className="mt-0.5 block text-xs text-content-muted">{description}</span>
        ) : null}
      </span>
      {trailing ? (
        <span className="shrink-0 text-sm text-content" data-numeric>
          {trailing}
        </span>
      ) : null}
    </label>
  );
}
