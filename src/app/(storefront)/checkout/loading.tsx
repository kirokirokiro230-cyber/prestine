import { CheckoutSkeleton } from "@/components/ui/skeleton";

/** Matches `CheckoutFlow`'s own hydration-gate skeleton exactly. */
export default function Loading() {
  return <CheckoutSkeleton />;
}
