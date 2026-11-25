import { AdminStatCardsSkeleton, Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-8 w-28" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="h-9 w-52" />
      </div>

      <AdminStatCardsSkeleton count={4} />

      <div className="border border-line bg-surface p-5">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="mt-4 h-56 w-full" />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="border border-line bg-surface p-5">
            <Skeleton className="h-3 w-32" />
            <div className="mt-4 flex flex-col gap-3">
              {Array.from({ length: 4 }, (_, j) => (
                <Skeleton key={j} className="h-4 w-full" />
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="border border-line bg-surface p-5">
        <Skeleton className="h-3 w-28" />
        <div className="mt-4 flex flex-col gap-3">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-4 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}
