import { AccountPageSkeleton, BlockListSkeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <AccountPageSkeleton>
      <BlockListSkeleton count={3} blockClassName="h-32" />
    </AccountPageSkeleton>
  );
}
