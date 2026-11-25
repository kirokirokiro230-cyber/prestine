import { ConfirmationSkeleton } from "@/components/ui/skeleton";

/**
 * Covers the page's own `await Promise.all([bestSellers, storeSettings])` before
 * it even reaches its internal `<Suspense>` boundary around `ConfirmationView`.
 */
export default function Loading() {
  return <ConfirmationSkeleton />;
}
