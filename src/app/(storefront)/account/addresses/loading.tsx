import { AccountPageSkeleton, Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <AccountPageSkeleton>
      <div className="grid gap-4 sm:grid-cols-2">
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    </AccountPageSkeleton>
  );
}
