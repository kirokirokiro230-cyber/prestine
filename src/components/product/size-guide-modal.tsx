"use client";

import { useState } from "react";
import { Ruler } from "@phosphor-icons/react";
import { Modal } from "@/components/ui/modal";
import { sizeGuides } from "@/lib/config";
import type { SizeSystem } from "@/lib/types";

/**
 * Size guide trigger + dialog.
 *
 * Placed next to the size picker rather than buried in a tab, because "which size
 * am I?" is the question that stops a purchase. The table is a real `<table>` with
 * scope attributes so it is navigable with a screen reader.
 */
export function SizeGuideModal({ system }: { system: SizeSystem }) {
  const [open, setOpen] = useState(false);
  const guide = system === "waist" ? sizeGuides.waist : sizeGuides.alpha;

  if (system === "one-size") return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 text-2xs uppercase tracking-[0.1em] text-content-muted transition-colors hover:text-content"
      >
        <Ruler size={13} aria-hidden />
        <span className="link-underline">Size guide</span>
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Size guide"
        description={guide.label}
        size="lg"
      >
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <caption className="sr-only">
              {guide.label} — body measurements in inches
            </caption>
            <thead>
              <tr className="border-b border-line-strong">
                {guide.columns.map((column) => (
                  <th
                    key={column}
                    scope="col"
                    className="whitespace-nowrap px-3 py-3 text-left text-2xs font-medium uppercase tracking-[0.1em] text-content-muted"
                  >
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {guide.rows.map((row) => (
                <tr key={row[0]} className="border-b border-line last:border-0">
                  {row.map((cell, cellIndex) =>
                    cellIndex === 0 ? (
                      <th
                        key={cell}
                        scope="row"
                        className="whitespace-nowrap px-3 py-3 text-left font-medium text-content"
                      >
                        {cell}
                      </th>
                    ) : (
                      <td
                        key={`${row[0]}-${cellIndex}`}
                        data-numeric
                        className="whitespace-nowrap px-3 py-3 text-content-muted"
                      >
                        {cell}
                      </td>
                    ),
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-8 grid gap-6 border-t border-line pt-6 sm:grid-cols-2">
          <div>
            <h3 className="font-sans text-2xs font-medium uppercase tracking-[0.12em]">
              How to measure
            </h3>
            <ul className="mt-3 flex flex-col gap-2 text-sm text-content-muted">
              <li>
                <strong className="font-medium text-content">Chest</strong> — around the
                fullest part, under the arms, tape level.
              </li>
              <li>
                <strong className="font-medium text-content">Waist</strong> — at your
                natural waist, the narrowest point.
              </li>
              <li>
                <strong className="font-medium text-content">Hip</strong> — around the
                fullest part, roughly 8&quot; below the waist.
              </li>
              <li>
                <strong className="font-medium text-content">Inseam</strong> — from the
                crotch seam to the hem of a trouser that fits you.
              </li>
            </ul>
          </div>

          <div>
            <h3 className="font-sans text-2xs font-medium uppercase tracking-[0.12em]">
              Between sizes?
            </h3>
            <p className="mt-3 text-sm leading-relaxed text-content-muted">
              Size up for outerwear and knitwear if you plan to layer; size down for a
              closer fit in jersey, which relaxes with wear. If you are still unsure,
              email us your measurements and we will tell you which size we would send —
              usually within a couple of hours.
            </p>
          </div>
        </div>
      </Modal>
    </>
  );
}
