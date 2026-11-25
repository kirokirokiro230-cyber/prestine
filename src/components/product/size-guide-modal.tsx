"use client";

import { useState } from "react";
import { Ruler } from "@phosphor-icons/react";
import { Drawer } from "@/components/ui/drawer";
import { guideForSystem } from "@/lib/size-guide";
import type { SizeSystem } from "@/lib/types";
import { SizeGuideContent } from "./size-guide-content";

/**
 * Size guide trigger and the drawer it opens.
 *
 * Placed next to the size picker rather than buried in a tab, because "which size am I?" is
 * the question that stops a purchase. A side drawer rather than a centred dialog so the
 * product, and the size buttons it is about, stay in view beside the chart on a wide screen.
 *
 * Shows nothing for a product that has no chart (one size, shoes) instead of a chart for
 * something else.
 */
export function SizeGuideModal({
  system,
  selectedSize,
}: {
  system: SizeSystem;
  /** The size chosen on the product so far; its row is marked in the chart. */
  selectedSize?: string | null;
}) {
  const [open, setOpen] = useState(false);

  if (!guideForSystem(system)) return null;

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

      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title="Size guide"
        widthClass="w-full sm:max-w-[44rem]"
      >
        <SizeGuideContent
          system={system}
          selectedSize={selectedSize}
          className="px-5 pb-10 pt-4 sm:px-8"
        />
      </Drawer>
    </>
  );
}
