import { AdminStatCardsSkeleton, BlockListSkeleton, Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-4 w-full max-w-2xl" />
      </div>
      <AdminStatCardsSkeleton count={3} />
      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr] xl:items-start">
        <div className="border border-line bg-surface p-5">
          <BlockListSkeleton count={4} blockClassName="h-20" />
        </div>
        <Skeleton className="h-48 w-full" />
      </div>
    </div>
  );
}
