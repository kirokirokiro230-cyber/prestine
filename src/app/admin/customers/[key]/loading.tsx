import { AdminStatCardsSkeleton, Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-48" />
      </div>

      <AdminStatCardsSkeleton count={4} />

      <div className="grid gap-6 xl:grid-cols-[1fr_20rem] xl:items-start">
        <Skeleton className="h-96 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    </div>
  );
}
