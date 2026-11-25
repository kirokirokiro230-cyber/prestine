import { CartSkeleton } from "@/components/ui/skeleton";

/**
 * Covers the brief server-render wait before `CartView` mounts. Matches that
 * component's own hydration-gate skeleton exactly, so there is no visual seam
 * between this and the client-side fallback that follows it.
 */
export default function Loading() {
  return <CartSkeleton />;
}
