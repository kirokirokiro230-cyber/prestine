import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-4 w-full max-w-2xl" />
      </div>
      <div className="flex flex-col gap-4 border border-line bg-surface p-5">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-11 w-full" />
        ))}
      </div>
      <div className="border border-line bg-surface p-5">
        <Skeleton className="h-3 w-40" />
        <Skeleton className="mt-4 h-24 w-full" />
      </div>
    </div>
  );
}
