"use client";

import { useState } from "react";
import Link from "next/link";
import { CaretDown, Moon, SignIn, Sun } from "@phosphor-icons/react";
import { useTheme } from "@/components/providers/theme-provider";
import { Drawer } from "@/components/ui/drawer";
import { accountNav, type NavItem } from "@/lib/navigation";
import { cn } from "@/lib/utils";

/**
 * Mobile navigation drawer.
 *
 * Sections expand in place rather than sliding to a sub-panel, which keeps the
 * back-navigation model simple: one Escape or one tap closes everything. All
 * rows are at least 48px tall to meet Android's touch-target guidance.
 */
export function MobileNav({
  open,
  onClose,
  nav,
  contact,
}: {
  open: boolean;
  onClose: () => void;
  nav: NavItem[];
  contact: { email: string; address: string };
}) {
  /**
   * Everything starts collapsed.
   *
   * This used to pre-open the first expandable section, which meant tapping the menu
   * button presented about twenty rows at once — the five top-level items buried under
   * the whole Shop tree plus the feature card. The first thing a shopper sees is now the
   * five destinations, and Shop is one tap away.
   *
   * The cost is that reaching a category takes two taps instead of one. That is the right
   * trade for a menu whose job is orientation: a wall of links is not faster to use than
   * a short list, it is just harder to read.
   */
  const [expanded, setExpanded] = useState<string | null>(null);
  const { resolved, toggle } = useTheme();

  return (
    <Drawer open={open} onClose={onClose} side="left" title="Menu" widthClass="w-full max-w-sm">
      <nav aria-label="Mobile" className="flex flex-col">
        {nav.map((item) => {
          const isExpanded = expanded === item.label;
          const panelId = `mobile-panel-${item.label.replace(/\s+/g, "-").toLowerCase()}`;

          if (!item.columns) {
            return (
              <Link
                key={item.label}
                href={item.href}
                onClick={onClose}
                className={cn(
                  "flex min-h-12 items-center border-b border-line px-5 text-sm font-medium tracking-wide transition-colors active:bg-surface-sunken",
                  item.label === "Sale" && "text-danger-500 dark:text-clay-300",
                )}
              >
                {item.label}
              </Link>
            );
          }

          return (
            <div key={item.label} className="border-b border-line">
              <button
                type="button"
                onClick={() => setExpanded(isExpanded ? null : item.label)}
                aria-expanded={isExpanded}
                aria-controls={panelId}
                className="flex min-h-12 w-full items-center justify-between gap-3 px-5 text-left text-sm font-medium tracking-wide transition-colors active:bg-surface-sunken"
              >
                {item.label}
                <CaretDown
                  size={14}
                  aria-hidden
                  className={cn(
                    "shrink-0 text-content-muted transition-transform duration-300",
                    isExpanded && "rotate-180",
                  )}
                />
              </button>

              <div id={panelId} hidden={!isExpanded} className="bg-surface-sunken/60 pb-4">
                {item.columns.map((column, index) => (
                  <div key={`${column.heading}-${index}`} className="px-5 pt-4">
                    <p className="eyebrow mb-2.5">{column.heading}</p>
                    <ul>
                      {column.links.map((link) => (
                        <li key={link.href + link.label}>
                          <Link
                            href={link.href}
                            onClick={onClose}
                            className="flex min-h-11 items-center text-sm text-content-muted transition-colors active:text-content"
                          >
                            {link.label}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}

                {item.feature ? (
                  <Link
                    href={item.feature.href}
                    onClick={onClose}
                    className="mx-5 mt-4 block border border-line bg-surface p-4"
                  >
                    <p className="eyebrow mb-1.5">{item.feature.eyebrow}</p>
                    <p className="font-display text-lg leading-snug">{item.feature.title}</p>
                    <p className="mt-2 text-xs text-content-muted">{item.feature.cta} →</p>
                  </Link>
                ) : null}
              </div>
            </div>
          );
        })}
      </nav>

      <div className="mt-6 px-5">
        <p className="eyebrow mb-3">Your account</p>
        <ul>
          {accountNav.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                onClick={onClose}
                className="flex min-h-11 items-center gap-2 text-sm text-content-muted transition-colors active:text-content"
              >
                {link.label}
              </Link>
            </li>
          ))}
          <li>
            <Link
              href="/signin"
              onClick={onClose}
              className="flex min-h-11 items-center gap-2 text-sm text-content-muted transition-colors active:text-content"
            >
              <SignIn size={16} aria-hidden />
              Sign in
            </Link>
          </li>
        </ul>
      </div>

      <div className="mt-6 border-t border-line px-5 py-5">
        <button
          type="button"
          onClick={toggle}
          className="flex min-h-11 w-full items-center justify-between text-sm text-content"
        >
          <span className="flex items-center gap-2">
            {resolved === "dark" ? (
              <Moon size={16} aria-hidden />
            ) : (
              <Sun size={16} aria-hidden />
            )}
            {resolved === "dark" ? "Dark theme" : "Light theme"}
          </span>
          <span className="text-2xs uppercase tracking-[0.12em] text-content-muted">
            Switch
          </span>
        </button>

        <p className="mt-5 text-xs leading-relaxed text-content-subtle">
          {contact.address}
          <br />
          <a href={`mailto:${contact.email}`} className="link-underline">
            {contact.email}
          </a>
        </p>
      </div>
    </Drawer>
  );
}
