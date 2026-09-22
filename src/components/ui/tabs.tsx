"use client";

import { useId, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export interface TabItem {
  id: string;
  label: string;
  /** Optional count shown after the label, e.g. review totals. */
  count?: number;
  content: React.ReactNode;
}

/**
 * Tabs implementing the ARIA tabs pattern with manual activation: arrow keys
 * move focus and Enter/Space selects, which is the recommended behaviour when
 * panels contain substantial content.
 */
export function Tabs({
  items,
  defaultTab,
  className,
}: {
  items: TabItem[];
  defaultTab?: string;
  className?: string;
}) {
  const [active, setActive] = useState(defaultTab ?? items[0]?.id);
  const baseId = useId();
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const onKeyDown = (event: React.KeyboardEvent, index: number) => {
    const last = items.length - 1;
    let next = -1;

    if (event.key === "ArrowRight") next = index === last ? 0 : index + 1;
    else if (event.key === "ArrowLeft") next = index === 0 ? last : index - 1;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = last;
    else return;

    event.preventDefault();
    tabRefs.current[next]?.focus();
    setActive(items[next].id);
  };

  return (
    <div className={className}>
      <div
        role="tablist"
        aria-label="Product information"
        className="no-scrollbar flex gap-6 overflow-x-auto border-b border-line"
      >
        {items.map((item, index) => {
          const selected = item.id === active;
          return (
            <button
              key={item.id}
              ref={(node) => {
                tabRefs.current[index] = node;
              }}
              type="button"
              role="tab"
              id={`${baseId}-${item.id}-tab`}
              aria-selected={selected}
              aria-controls={`${baseId}-${item.id}-panel`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActive(item.id)}
              onKeyDown={(event) => onKeyDown(event, index)}
              className={cn(
                "relative -mb-px shrink-0 border-b-2 pb-3 text-2xs font-medium uppercase tracking-[0.14em] transition-colors",
                selected
                  ? "border-inverse text-content"
                  : "border-transparent text-content-subtle hover:text-content",
              )}
            >
              {item.label}
              {typeof item.count === "number" ? (
                <span data-numeric className="ml-1.5 text-content-subtle">
                  ({item.count})
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {items.map((item) => (
        <div
          key={item.id}
          role="tabpanel"
          id={`${baseId}-${item.id}-panel`}
          aria-labelledby={`${baseId}-${item.id}-tab`}
          hidden={item.id !== active}
          tabIndex={0}
          className="pt-6 focus-visible:outline-none"
        >
          {item.content}
        </div>
      ))}
    </div>
  );
}
