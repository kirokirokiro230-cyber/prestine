"use client";

import { useTrackProductView } from "@/components/providers/recently-viewed-provider";

/**
 * Records a product view in localStorage. Renders nothing — it exists so the
 * product page itself can stay a server component.
 */
export function ViewTracker({ slug }: { slug: string }) {
  useTrackProductView(slug);
  return null;
}
