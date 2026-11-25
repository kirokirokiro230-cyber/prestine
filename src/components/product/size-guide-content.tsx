"use client";

import { useState } from "react";
import { Minus, Plus } from "@phosphor-icons/react";
import {
  formatMeasurement,
  guideForSystem,
  unitLabel,
  type MeasurementUnit,
} from "@/lib/size-guide";
import type { SizeSystem } from "@/lib/types";
import { cn } from "@/lib/utils";
import { MeasureDiagram } from "./measure-diagram";

/**
 * The size guide itself: a chart, an inch/centimetre switch, and how to measure.
 *
 * Shared by the drawer on a product page and by the full `/size-guide` page, so a shopper
 * sees the same thing in both and a correction is made once.
 *
 * ## Two collapsible sections
 *
 * Native `<details>` rather than a script: it works before the page has hydrated, is
 * keyboard and screen-reader operable as it stands, and both sections start open so
 * nothing is hidden from someone who just wants the numbers.
 *
 * ## The chart
 *
 * A real table with header scopes. When the shopper has already chosen a size, its row is
 * marked, so the answer to "what are the measurements of the one I picked?" is the first
 * thing they see.
 */
export function SizeGuideContent({
  system,
  selectedSize,
  defaultUnit = "inch",
  showAdvice = true,
  className,
}: {
  system: SizeSystem;
  /** The size currently chosen on the product, if any. Its row is highlighted. */
  selectedSize?: string | null;
  defaultUnit?: MeasurementUnit;
  /** The closing "between two sizes?" paragraph. The full page says it once, not twice. */
  showAdvice?: boolean;
  className?: string;
}) {
  const [unit, setUnit] = useState<MeasurementUnit>(defaultUnit);
  const guide = guideForSystem(system);

  if (!guide) return null;

  const isTops = system === "alpha";

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <GuideSection title="Size chart">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[22rem] border-collapse text-center text-sm">
            <caption className="sr-only">
              {isTops ? "Garment measurements by size" : "Measurements by waist size"}, in{" "}
              {unitLabel(unit).toLowerCase()}
            </caption>
            <thead>
              <tr>
                <td className="border border-line p-3" aria-hidden />
                {guide.columns.map((column) => (
                  <th
                    key={column.key}
                    scope="col"
                    className="border border-line px-3 py-4 text-sm font-semibold uppercase tracking-[0.02em] text-content"
                  >
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {guide.rows.map((row) => {
                const selected = selectedSize === row.size;

                return (
                  <tr key={row.size} className={cn(selected && "bg-accent-soft/60")}>
                    <th
                      scope="row"
                      aria-current={selected ? "true" : undefined}
                      className="border border-line px-3 py-4 text-base font-normal text-content"
                    >
                      {row.size}
                    </th>
                    {row.inches.map((value, index) => (
                      <td
                        key={guide.columns[index].key}
                        data-numeric
                        className="border border-line px-3 py-4 text-base tabular-nums text-content"
                      >
                        {formatMeasurement(value, unit)}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <p className="mt-5 text-base text-content" aria-live="polite">
          Measurements are in {unitLabel(unit)}
        </p>

        <div className="mt-4 flex items-center gap-4 text-base" role="group" aria-label="Unit">
          {(["inch", "cm"] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setUnit(option)}
              aria-pressed={unit === option}
              className={cn(
                "py-1 transition-colors",
                unit === option
                  ? "text-content underline underline-offset-4"
                  : "text-content-subtle hover:text-content",
              )}
            >
              {option}
            </button>
          ))}
        </div>
      </GuideSection>

      <GuideSection title="How to measure">
        {isTops ? (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="bg-surface-sunken p-4 sm:p-6">
                <MeasureDiagram side="front" />
              </div>
              <div className="bg-surface-sunken p-4 sm:p-6">
                <MeasureDiagram side="back" />
              </div>
            </div>

            <dl className="mt-6 grid gap-x-8 gap-y-4 text-sm leading-relaxed sm:grid-cols-2">
              <Definition term="Chest">
                Around the fullest part of the garment, just under the sleeves.
              </Definition>
              <Definition term="Length">
                From the top of the shoulder at the collar, straight down to the hem.
              </Definition>
              <Definition term="Shoulder">
                Across the back, from one shoulder seam to the other.
              </Definition>
              <Definition term="Sleeve">From the shoulder seam to the hem of the sleeve.</Definition>
            </dl>

            <p className="mt-6 text-sm leading-relaxed text-content-muted">
              The easiest check: lay a tee you already own and like on a flat surface, measure it
              the same way, and pick the size closest to it.
            </p>
          </>
        ) : (
          <dl className="grid gap-x-8 gap-y-4 text-sm leading-relaxed sm:grid-cols-2">
            <Definition term="Waist">
              At the natural waist, the narrowest point, usually just above the navel.
            </Definition>
            <Definition term="Hip">
              Around the fullest part, roughly 8&quot; below the natural waist.
            </Definition>
            <Definition term="Inseam">
              From the crotch seam to the hem of a pair that already fits you well.
            </Definition>
            <Definition term="Leg opening">Across the hem, laid flat, doubled.</Definition>
          </dl>
        )}
      </GuideSection>

      {showAdvice ? (
        <p className="mt-6 text-sm leading-relaxed text-content-muted">
          Between two sizes? Take the larger for a relaxed fit and the smaller for a closer one.
          If you are still unsure, send us your measurements and we will tell you which size we
          would send.
        </p>
      ) : null}
    </div>
  );
}

/** A heading that opens and closes its content. Starts open. */
function GuideSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <details open className="group border-b border-line pb-6 last-of-type:border-b-0">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 border-b border-line py-4 [&::-webkit-details-marker]:hidden">
        <h3 className="font-sans text-xl font-semibold uppercase leading-tight tracking-tight text-content sm:text-2xl">
          {title}
        </h3>
        <Minus size={20} aria-hidden className="hidden shrink-0 group-open:block" />
        <Plus size={20} aria-hidden className="shrink-0 group-open:hidden" />
      </summary>
      <div className="pt-6">{children}</div>
    </details>
  );
}

function Definition({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="font-medium text-content">{term}</dt>
      <dd className="mt-0.5 text-content-muted">{children}</dd>
    </div>
  );
}
