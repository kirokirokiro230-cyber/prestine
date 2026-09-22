"use client";

import { createPortal } from "react-dom";
import { X } from "@phosphor-icons/react";
import { useIsHydrated } from "@/hooks/use-store";
import { useEscapeKey, useFocusTrap, useScrollLock } from "@/hooks/use-ui";
import { cn } from "@/lib/utils";
import { IconButton } from "./button";

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  /** Which edge the panel enters from. */
  side?: "right" | "left" | "bottom";
  title: string;
  /** Visually hide the title while keeping the accessible name. */
  hideTitle?: boolean;
  description?: string;
  /** Pinned to the bottom of the panel, outside the scroll area. */
  footer?: React.ReactNode;
  widthClass?: string;
  children: React.ReactNode;
}

const SIDE_PANEL: Record<NonNullable<DrawerProps["side"]>, string> = {
  right: "inset-y-0 right-0 h-full animate-slide-in-right",
  left: "inset-y-0 left-0 h-full animate-slide-in-left",
  bottom: "inset-x-0 bottom-0 max-h-[88vh] w-full animate-slide-up",
};

/**
 * Accessible side sheet.
 *
 * - Rendered in a portal so it escapes any transformed/overflow-hidden ancestor.
 * - `role="dialog"` + `aria-modal` + focus trap + Escape + scrolled-behind lock.
 * - Unmounts on close so its contents leave the tab order entirely.
 */
export function Drawer({
  open,
  onClose,
  side = "right",
  title,
  hideTitle = false,
  description,
  footer,
  widthClass = "w-full max-w-md",
  children,
}: DrawerProps) {
  const panelRef = useFocusTrap<HTMLDivElement>(open);
  // A portal needs `document.body`, which does not exist during server render.
  const hydrated = useIsHydrated();

  useScrollLock(open);
  useEscapeKey(open, onClose);

  if (!hydrated || !open) return null;

  const titleId = `drawer-title-${title.replace(/\s+/g, "-").toLowerCase()}`;
  const descriptionId = description ? `${titleId}-description` : undefined;

  return createPortal(
    <div className="fixed inset-0 z-90" role="presentation">
      {/* Scrim strong enough to isolate the panel in both themes. */}
      <button
        type="button"
        aria-label="Close panel"
        onClick={onClose}
        className="absolute inset-0 h-full w-full animate-fade-in cursor-default bg-overlay backdrop-blur-[2px]"
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className={cn(
          "absolute flex flex-col bg-surface shadow-xl",
          SIDE_PANEL[side],
          side === "bottom" ? "w-full" : widthClass,
        )}
      >
        <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <h2
              id={titleId}
              className={cn(
                "font-sans text-2xs font-medium uppercase tracking-[0.16em] text-content",
                hideTitle && "sr-only",
              )}
            >
              {title}
            </h2>
            {description ? (
              <p id={descriptionId} className="mt-1 text-xs text-content-muted">
                {description}
              </p>
            ) : null}
          </div>
          <IconButton
            label="Close"
            onClick={onClose}
            className="-mr-2 -mt-2 shrink-0"
          >
            <X size={18} aria-hidden />
          </IconButton>
        </header>

        <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {children}
        </div>

        {footer ? (
          <div className="border-t border-line bg-surface px-5 py-4 sm:px-6">{footer}</div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
