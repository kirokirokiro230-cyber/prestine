"use client";

import type { CSSProperties } from "react";
import Link from "next/link";
import { ArrowRight } from "@phosphor-icons/react";
import type { NavColumn, NavItem } from "@/lib/navigation";
import { cn } from "@/lib/utils";

interface MegaMenuProps {
  item: NavItem;
  open: boolean;
  /** Called when a link inside is activated, so the header can close the panel. */
  onNavigate: () => void;
  id: string;
}

/**
 * Desktop mega menu panel.
 *
 * Kept mounted and hidden with `invisible` + `opacity` rather than unmounted, so
 * moving the pointer between the trigger and the panel does not cause a flicker.
 * `inert`-like behaviour is achieved by removing it from the tab order via
 * `tabIndex={-1}` on the wrapper when closed.
 */
/**
 * A list this long is split into two sub-columns instead of running as one stack.
 *
 * Eight categories plus "All clothing" made a nine-row column beside a four-row one:
 * dense on the left, a large void on the right, and the panel twice as tall as it needed
 * to be. Splitting at seven keeps any single list to roughly four or five rows, which is
 * scannable in one glance.
 *
 * A threshold rather than a hard-coded layout because categories are merchant-managed —
 * the panel has to stay balanced whether there are three of them or twelve.
 */
const SPLIT_ABOVE = 6;

/**
 * Grid tracks, as an inline style rather than a Tailwind class.
 *
 * The previous version kept a lookup table of literal class strings because Tailwind
 * scans source text and would purge an interpolated `lg:grid-cols-${n}`. That works but
 * caps the panel at four tracks and cannot give a split list the extra width it needs.
 * `gridTemplateColumns` sidesteps the scanner entirely, so the widths can be derived.
 */
function tracks(columns: NavColumn[], hasFeature: boolean): string {
  const lists = columns.map((column) =>
    column.links.length > SPLIT_ABOVE ? "1.9fr" : "1fr",
  );
  return [...lists, ...(hasFeature ? ["1.4fr"] : [])].join(" ");
}

export function MegaMenu({ item, open, onNavigate, id }: MegaMenuProps) {
  if (!item.columns) return null;

  return (
    <div
      id={id}
      hidden={!open}
      className={cn(
        "absolute inset-x-0 top-full border-b border-line bg-surface shadow-md",
        open ? "animate-fade-in" : "",
      )}
    >
      {/*
        One column below `lg`, derived tracks above it. The track list arrives as a CSS
        custom property so the class name stays a literal Tailwind can see, which is the
        constraint the old lookup table existed to work around.
      */}
      <div
        className="page-gutter mx-auto grid max-w-page grid-cols-1 gap-x-12 gap-y-9 py-12 lg:grid-cols-[var(--mega-tracks)] lg:gap-x-14"
        style={
          { "--mega-tracks": tracks(item.columns, Boolean(item.feature)) } as CSSProperties
        }
      >
        {item.columns.map((column, index) => {
          const split = column.links.length > SPLIT_ABOVE;

          return (
            <div key={`${column.heading}-${index}`}>
              <p className="eyebrow mb-5">{column.heading}</p>

              {/*
                `gap-y-3.5` rather than the old 2.5. At 14px type, 10px between rows
                reads as a block of text; 14px lets each row register as its own target.
                Row height is 40px including the link's own padding, which also makes
                these comfortable to hit with a trackpad.
              */}
              <ul
                className={cn(
                  "grid gap-y-3.5",
                  split && "lg:grid-cols-2 lg:gap-x-10",
                )}
              >
                {column.links.map((link) => (
                  <li key={link.href + link.label}>
                    <Link
                      href={link.href}
                      onClick={onNavigate}
                      className="link-underline inline-block py-1 text-sm leading-snug text-content-muted transition-colors hover:text-content"
                    >
                      {link.label}
                    </Link>
                    {link.note ? (
                      <p className="mt-0.5 text-xs text-content-subtle">{link.note}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}

        {item.feature ? (
          <div className="border-l border-line pl-12 max-lg:border-l-0 max-lg:border-t max-lg:pl-0 max-lg:pt-7">
            <p className="eyebrow mb-3">{item.feature.eyebrow}</p>
            <h3 className="text-2xl leading-tight">{item.feature.title}</h3>
            <p className="mt-3 max-w-sm text-sm leading-relaxed text-content-muted">
              {item.feature.body}
            </p>
            <Link
              href={item.feature.href}
              onClick={onNavigate}
              className="group mt-5 inline-flex items-center gap-2 text-2xs font-medium uppercase tracking-[0.14em] text-content"
            >
              <span className="link-underline">{item.feature.cta}</span>
              <ArrowRight
                size={13}
                aria-hidden
                className="transition-transform duration-300 group-hover:translate-x-1"
              />
            </Link>
          </div>
        ) : null}
      </div>
    </div>
  );
}
