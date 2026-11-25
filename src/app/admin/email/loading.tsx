import { AdminTableSkeleton, Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-24" />
        <Skeleton className="h-4 w-full max-w-2xl" />
      </div>
      <AdminTableSkeleton rows={8} columns={4} />
    </div>
  );
}
