"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { CaretDown } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { CONTROL, FieldShell } from "./field";

/**
 * Text input with suggestions. Free text is always allowed.
 *
 * ## Why this is not a `SelectField`
 *
 * A select is right when the set of valid answers is closed. City is not: India has
 * thousands of towns, and any list short enough to ship on a checkout page will be
 * missing someone's. A dropdown that cannot express where a shopper lives is a checkout
 * they cannot complete — so the suggestions are help, not a constraint, and whatever is
 * typed stands.
 *
 * ## Why not `<datalist>`
 *
 * It does exactly this with no JavaScript, but the browser draws the popup and no
 * stylesheet reaches it — the same reason the native `<select>` was replaced.
 *
 * ## Behaviour
 *
 * Follows the editable-combobox pattern: `role="combobox"` on the input with
 * `aria-autocomplete="list"`, a `role="listbox"` popup, and `aria-activedescendant`
 * tracking the highlighted row so focus stays in the input and typing never breaks.
 *
 * - Suggestions open on focus and filter as you type.
 * - Arrows move, Enter accepts the highlighted one, Escape closes and keeps what you typed.
 * - Nothing is auto-selected on open, so pressing Enter to submit does not silently swap
 *   a typed value for the first suggestion.
 */

export interface ComboboxFieldProps {
  label: string;
  /** Suggestions. Filtered by what has been typed; never restricts the value. */
  suggestions: string[];
  value: string;
  onValueChange: (value: string) => void;
  name?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  id?: string;
  /** Cap on rows rendered at once. A thousand-row popup helps nobody. */
  maxVisible?: number;
}

export function ComboboxField({
  label,
  suggestions,
  value,
  onValueChange,
  name,
  hint,
  error,
  required,
  disabled,
  placeholder,
  className,
  id,
  maxVisible = 8,
}: ComboboxFieldProps) {
  const generated = useId();
  const fieldId = id ?? generated;
  const listId = `${fieldId}-listbox`;

  const [open, setOpen] = useState(false);
  /** -1 means "nothing highlighted", which is the state Enter must not overwrite. */
  const [activeIndex, setActiveIndex] = useState(-1);

  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  /*
   * Case-insensitive `includes` rather than `startsWith`: someone typing "bangal" should
   * find "Bengaluru" is not helped either way, but "nagar" finding "Srinagar" is exactly
   * the kind of half-remembered spelling a suggestion list exists for.
   */
  const needle = value.trim().toLowerCase();
  const matches = (
    needle
      ? suggestions.filter((option) => option.toLowerCase().includes(needle))
      : suggestions
  ).slice(0, maxVisible);

  // An exact match means the list has nothing left to offer.
  const exact = suggestions.some((option) => option.toLowerCase() === needle);
  const showList = open && matches.length > 0 && !(exact && matches.length === 1);

  const close = useCallback(() => {
    setOpen(false);
    setActiveIndex(-1);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) close();
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [close, open]);

  useEffect(() => {
    if (!showList || activeIndex < 0) return;
    listRef.current
      ?.querySelector(`[data-index="${activeIndex}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, showList]);

  const accept = (option: string) => {
    onValueChange(option);
    close();
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!open) setOpen(true);
      setActiveIndex((current) => (current + 1) % Math.max(matches.length, 1));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) =>
        current <= 0 ? matches.length - 1 : current - 1,
      );
      return;
    }
    if (event.key === "Escape") {
      // Keeps what was typed. Escape closes the helper, it does not undo the answer.
      close();
      return;
    }
    if (event.key === "Enter" && showList && activeIndex >= 0) {
      // Only when a row is highlighted, so Enter still submits an already-typed value.
      event.preventDefault();
      accept(matches[activeIndex]);
    }
  };

  return (
    <FieldShell
      label={label}
      htmlFor={fieldId}
      hint={hint}
      error={error}
      required={required}
      className={className}
    >
      <div ref={rootRef} className="relative">
        <input
          id={fieldId}
          name={name}
          type="text"
          role="combobox"
          autoComplete="off"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={
            showList && activeIndex >= 0 ? `${fieldId}-option-${activeIndex}` : undefined
          }
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${fieldId}-error` : hint ? `${fieldId}-hint` : undefined}
          required={required}
          disabled={disabled}
          placeholder={placeholder}
          value={value}
          onChange={(event) => {
            onValueChange(event.target.value);
            setOpen(true);
            setActiveIndex(-1);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          className={cn(
            CONTROL,
            "pr-10",
            error ? "border-danger-500" : "border-line-strong",
          )}
        />

        <CaretDown
          size={14}
          aria-hidden
          className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-content-muted"
        />

        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          aria-label={`${label} suggestions`}
          hidden={!showList}
          className="absolute z-50 mt-1 max-h-64 w-full overflow-y-auto border border-line-strong bg-surface py-1 shadow-lg"
        >
          {matches.map((option, index) => (
            <li
              key={option}
              id={`${fieldId}-option-${index}`}
              role="option"
              aria-selected={index === activeIndex}
              data-index={index}
              // `pointerdown` so the choice lands before the input's blur closes the list.
              onPointerDown={(event) => {
                event.preventDefault();
                accept(option);
              }}
              onPointerEnter={() => setActiveIndex(index)}
              className={cn(
                "cursor-pointer px-3.5 py-2.5 text-sm text-content-muted transition-colors",
                index === activeIndex && "bg-surface-sunken text-content",
              )}
            >
              {option}
            </li>
          ))}
        </ul>
      </div>
    </FieldShell>
  );
}
