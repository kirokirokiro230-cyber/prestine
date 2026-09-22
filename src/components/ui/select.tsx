"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, CaretDown } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { CONTROL, FieldShell } from "./field";

/**
 * Themed select.
 *
 * ## Why this is a component and not CSS
 *
 * A native `<select>`'s option list is drawn by the operating system, outside the page.
 * No stylesheet reaches it — not the font, not the colours, not the dark theme. The old
 * field styled the closed control and then handed over to a Windows/macOS popup that
 * looked nothing like the rest of the admin. Matching the theme therefore means owning
 * the popup, which means owning the keyboard and screen-reader behaviour too.
 *
 * ## The tradeoff, stated plainly
 *
 * A native select on a phone opens the OS wheel picker, which is genuinely better than
 * anything reimplemented in a page. This trades that away for visual consistency. It is
 * the right call for an admin panel used mostly on a laptop; it would be the wrong call
 * for a high-traffic checkout field on mobile.
 *
 * ## Behaviour
 *
 * Follows the ARIA listbox pattern rather than approximating it:
 *
 * - Trigger is `role="combobox"` with `aria-expanded` and `aria-controls`.
 * - The popup is `role="listbox"`; each row is `role="option"` with `aria-selected`.
 * - The active row is tracked with `aria-activedescendant` on the trigger, so focus never
 *   leaves it and a screen reader announces the row as it moves. Moving DOM focus into
 *   the list instead is the common shortcut and it breaks type-ahead.
 * - Enter, Space, Down and Up open the popup. Arrows move, Home/End jump, Enter or Space
 *   selects, Escape closes without selecting, Tab closes and moves on.
 * - Typing jumps to the first option starting with those letters, resetting after a
 *   second of no input — the one native behaviour people actually rely on.
 *
 * ## Forms
 *
 * The value rides in a hidden input, so this works inside a plain server-action form with
 * no client state. Everything that used the native field keeps working.
 */

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectFieldProps {
  label: string;
  options: SelectOption[];
  /** Submitted with the form. Omit for a purely controlled select. */
  name?: string;
  /** Controlled value. */
  value?: string;
  /** Initial value when uncontrolled. */
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  hint?: string;
  error?: string;
  required?: boolean;
  disabled?: boolean;
  hideLabel?: boolean;
  className?: string;
  id?: string;
  /** Shown when nothing is selected yet. */
  placeholder?: string;
}

/** How long a type-ahead buffer survives without a new keystroke. */
const TYPEAHEAD_RESET_MS = 1000;

export function SelectField({
  label,
  options,
  name,
  value: controlledValue,
  defaultValue,
  onValueChange,
  hint,
  error,
  required,
  disabled,
  hideLabel,
  className,
  id,
  placeholder = "Select an option",
}: SelectFieldProps) {
  const generated = useId();
  const fieldId = id ?? generated;
  const listId = `${fieldId}-listbox`;

  const isControlled = controlledValue !== undefined;
  const [internalValue, setInternalValue] = useState(
    defaultValue ?? options[0]?.value ?? "",
  );
  const value = isControlled ? controlledValue : internalValue;

  const [open, setOpen] = useState(false);
  const selectedIndex = options.findIndex((option) => option.value === value);
  // Falls back to the first row so an unmatched value still gives the arrows a start.
  const [activeIndex, setActiveIndex] = useState(selectedIndex >= 0 ? selectedIndex : 0);

  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const typeahead = useRef({ buffer: "", at: 0 });

  const selected = selectedIndex >= 0 ? options[selectedIndex] : undefined;

  const commit = useCallback(
    (next: string) => {
      if (!isControlled) setInternalValue(next);
      onValueChange?.(next);
    },
    [isControlled, onValueChange],
  );

  const close = useCallback((returnFocus = true) => {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  }, []);

  /** Opening always starts from the current selection, never from wherever it last was. */
  const openList = useCallback(() => {
    if (disabled) return;
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
    setOpen(true);
  }, [disabled, selectedIndex]);

  /**
   * Step to the next enabled option.
   *
   * Skipping disabled rows in the mover rather than filtering them out of the list keeps
   * them visible and announced — a disabled option still tells the reader the choice
   * exists, which is usually why it was left in.
   */
  const move = useCallback(
    (from: number, step: 1 | -1) => {
      const total = options.length;
      for (let offset = 1; offset <= total; offset += 1) {
        const index = (from + step * offset + total * total) % total;
        if (!options[index]?.disabled) return index;
      }
      return from;
    },
    [options],
  );

  const edge = useCallback(
    (side: "first" | "last") => {
      const order = side === "first" ? options : [...options].reverse();
      const found = order.find((option) => !option.disabled);
      return found ? options.indexOf(found) : 0;
    },
    [options],
  );

  const select = useCallback(
    (index: number) => {
      const option = options[index];
      if (!option || option.disabled) return;
      commit(option.value);
      close();
    },
    [close, commit, options],
  );

  // Close on a click anywhere outside. `pointerdown` rather than `click` so the popup is
  // gone before a click on something behind it resolves.
  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  // Keep the active row in view when the arrows walk past the edge of a scrolling list.
  useEffect(() => {
    if (!open) return;
    listRef.current
      ?.querySelector(`[data-index="${activeIndex}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open]);

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (disabled) return;

    if (!open) {
      if (["Enter", " ", "ArrowDown", "ArrowUp"].includes(event.key)) {
        event.preventDefault();
        openList();
      }
      return;
    }

    switch (event.key) {
      case "Escape":
        event.preventDefault();
        close();
        return;
      case "Tab":
        // Not prevented: closing and letting focus move on is what a native select does.
        setOpen(false);
        return;
      case "Enter":
      case " ":
        event.preventDefault();
        select(activeIndex);
        return;
      case "ArrowDown":
        event.preventDefault();
        setActiveIndex((current) => move(current, 1));
        return;
      case "ArrowUp":
        event.preventDefault();
        setActiveIndex((current) => move(current, -1));
        return;
      case "Home":
        event.preventDefault();
        setActiveIndex(edge("first"));
        return;
      case "End":
        event.preventDefault();
        setActiveIndex(edge("last"));
        return;
      default:
        break;
    }

    // Type-ahead. Single printable characters only, so modifier combinations pass through.
    if (event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
      const now = Date.now();
      const buffer =
        now - typeahead.current.at > TYPEAHEAD_RESET_MS
          ? event.key.toLowerCase()
          : typeahead.current.buffer + event.key.toLowerCase();
      typeahead.current = { buffer, at: now };

      const match = options.findIndex(
        (option) => !option.disabled && option.label.toLowerCase().startsWith(buffer),
      );
      if (match >= 0) {
        event.preventDefault();
        setActiveIndex(match);
      }
    }
  };

  const activeId = open ? `${fieldId}-option-${activeIndex}` : undefined;

  const describedBy = useMemo(() => {
    if (error) return `${fieldId}-error`;
    if (hint) return `${fieldId}-hint`;
    return undefined;
  }, [error, fieldId, hint]);

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
      <div ref={rootRef} className="relative">
        {/*
          The value the form actually submits. Kept outside the trigger so a server action
          receives it with no client state, exactly as the native select did.
        */}
        {name ? <input type="hidden" name={name} value={value} /> : null}

        <button
          ref={triggerRef}
          type="button"
          id={fieldId}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-haspopup="listbox"
          aria-activedescendant={activeId}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          aria-required={required}
          disabled={disabled}
          onClick={() => (open ? close(false) : openList())}
          onKeyDown={onKeyDown}
          className={cn(
            CONTROL,
            "flex cursor-pointer items-center justify-between gap-3 pr-3 text-left",
            error ? "border-danger-500" : "border-line-strong",
            open && "border-accent",
          )}
        >
          <span className={cn("truncate", !selected && "text-content-subtle")}>
            {selected?.label ?? placeholder}
          </span>
          <CaretDown
            size={14}
            aria-hidden
            className={cn(
              "shrink-0 text-content-muted transition-transform duration-200",
              open && "rotate-180",
            )}
          />
        </button>

        {/*
          `hidden` rather than unmounted so the listbox keeps its id for
          `aria-controls`, which must point at a real element even while closed.

          `max-h-64` with scroll: a category list can be long, and a popup taller than the
          viewport is unreachable at the bottom.
        */}
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          aria-label={label}
          hidden={!open}
          tabIndex={-1}
          className="absolute z-50 mt-1 max-h-64 w-full overflow-y-auto border border-line-strong bg-surface py-1 shadow-lg"
        >
          {options.map((option, index) => {
            const isSelected = option.value === value;
            const isActive = index === activeIndex;

            return (
              <li
                key={option.value}
                id={`${fieldId}-option-${index}`}
                role="option"
                aria-selected={isSelected}
                aria-disabled={option.disabled}
                data-index={index}
                /*
                  `pointerdown`, not `click`: the trigger keeps DOM focus, and a click
                  handler here would fire after the button's blur handling on some
                  browsers and select the wrong row.
                */
                onPointerDown={(event) => {
                  event.preventDefault();
                  select(index);
                }}
                onPointerEnter={() => !option.disabled && setActiveIndex(index)}
                className={cn(
                  "flex cursor-pointer items-center justify-between gap-3 px-3.5 py-2.5 text-sm transition-colors",
                  option.disabled
                    ? "cursor-not-allowed text-content-subtle"
                    : "text-content-muted",
                  // Hover and keyboard share one highlight, so the two never disagree
                  // about which row is about to be chosen.
                  isActive && !option.disabled && "bg-surface-sunken text-content",
                  isSelected && "font-medium text-content",
                )}
              >
                <span className="truncate">{option.label}</span>
                {isSelected ? (
                  <Check size={13} weight="bold" aria-hidden className="shrink-0 text-accent" />
                ) : null}
              </li>
            );
          })}
        </ul>
      </div>
    </FieldShell>
  );
}
