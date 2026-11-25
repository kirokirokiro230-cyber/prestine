import { ProductGridSkeleton, Skeleton } from "@/components/ui/skeleton";

/** Matches `WishlistView`'s own hydration-gate skeleton. */
export default function Loading() {
  return (
    <div className="page-gutter mx-auto max-w-page py-10">
      <Skeleton className="h-10 w-52" />
      <div className="mt-10">
        <ProductGridSkeleton count={4} />
      </div>
    </div>
  );
}
