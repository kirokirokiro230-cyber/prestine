import { BlockListSkeleton, Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-full max-w-2xl" />
      </div>
      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr] xl:items-start">
        <div className="border border-line bg-surface p-5">
          <BlockListSkeleton count={5} blockClassName="h-16" />
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    </div>
  );
}
