"use client";

import { useId, useState } from "react";
import { Minus, Plus } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

export interface AccordionItem {
  id: string;
  title: string;
  content: React.ReactNode;
}

interface AccordionProps {
  items: AccordionItem[];
  /** Ids open on first render. */
  defaultOpen?: string[];
  /** Only one panel open at a time. */
  single?: boolean;
  className?: string;
}

/**
 * Disclosure list following the WAI-ARIA accordion pattern: the trigger is a
 * real button carrying `aria-expanded` and `aria-controls`, and the panel is
 * removed from the accessibility tree with `hidden` when collapsed.
 */
export function Accordion({
  items,
  defaultOpen = [],
  single = false,
  className,
}: AccordionProps) {
  const [open, setOpen] = useState<string[]>(defaultOpen);
  const baseId = useId();

  const toggle = (id: string) => {
    setOpen((current) => {
      if (current.includes(id)) return current.filter((i) => i !== id);
      return single ? [id] : [...current, id];
    });
  };

  return (
    <div className={cn("divide-y divide-line border-y border-line", className)}>
      {items.map((item) => {
        const isOpen = open.includes(item.id);
        const triggerId = `${baseId}-${item.id}-trigger`;
        const panelId = `${baseId}-${item.id}-panel`;

        return (
          <div key={item.id}>
            <h3>
              <button
                type="button"
                id={triggerId}
                aria-expanded={isOpen}
                aria-controls={panelId}
                onClick={() => toggle(item.id)}
                className="flex w-full items-center justify-between gap-4 py-4 text-left transition-colors hover:text-accent"
              >
                <span className="text-2xs font-medium uppercase tracking-[0.14em]">
                  {item.title}
                </span>
                <span aria-hidden className="shrink-0 text-content-muted">
                  {isOpen ? <Minus size={14} /> : <Plus size={14} />}
                </span>
              </button>
            </h3>

            <div
              id={panelId}
              role="region"
              aria-labelledby={triggerId}
              hidden={!isOpen}
              className="pb-5 text-sm leading-relaxed text-content-muted"
            >
              {item.content}
            </div>
          </div>
        );
      })}
    </div>
  );
}
