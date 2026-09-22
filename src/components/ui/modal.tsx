"use client";

import { createPortal } from "react-dom";
import { X } from "@phosphor-icons/react";
import { useIsHydrated } from "@/hooks/use-store";
import { useEscapeKey, useFocusTrap, useScrollLock } from "@/hooks/use-ui";
import { cn } from "@/lib/utils";
import { IconButton } from "./button";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  size?: "sm" | "md" | "lg" | "xl";
  children: React.ReactNode;
  footer?: React.ReactNode;
}

const SIZES = {
  sm: "max-w-sm",
  md: "max-w-lg",
  lg: "max-w-2xl",
  xl: "max-w-4xl",
} as const;

/** Centred dialog with the same accessibility contract as Drawer. */
export function Modal({
  open,
  onClose,
  title,
  description,
  size = "md",
  children,
  footer,
}: ModalProps) {
  const panelRef = useFocusTrap<HTMLDivElement>(open);
  // A portal needs `document.body`, which does not exist during server render.
  const hydrated = useIsHydrated();

  useScrollLock(open);
  useEscapeKey(open, onClose);

  if (!hydrated || !open) return null;

  const titleId = `modal-title-${title.replace(/\s+/g, "-").toLowerCase()}`;

  return createPortal(
    <div className="fixed inset-0 z-90 flex items-end justify-center sm:items-center">
      <button
        type="button"
        aria-label="Close dialog"
        onClick={onClose}
        className="absolute inset-0 h-full w-full animate-fade-in cursor-default bg-overlay backdrop-blur-[2px]"
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn(
          "relative flex max-h-[92vh] w-full flex-col bg-surface shadow-xl",
          "animate-slide-up sm:animate-scale-in sm:m-6",
          SIZES[size],
        )}
      >
        <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <h2
              id={titleId}
              className="font-display text-xl leading-tight text-content sm:text-2xl"
            >
              {title}
            </h2>
            {description ? (
              <p className="mt-1 text-sm text-content-muted">{description}</p>
            ) : null}
          </div>
          <IconButton label="Close" onClick={onClose} className="-mr-2 -mt-2 shrink-0">
            <X size={18} aria-hidden />
          </IconButton>
        </header>

        <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
          {children}
        </div>

        {footer ? (
          <div className="border-t border-line px-5 py-4 sm:px-6">{footer}</div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
