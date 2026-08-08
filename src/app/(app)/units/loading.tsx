import { Skeleton, SkeletonPageHeader } from "@/components/ui/skeleton";

export default function UnitsLoading() {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <SkeletonPageHeader />
      <Skeleton className="h-[28rem] rounded-2xl" />
      <div className="grid gap-4 sm:grid-cols-2">
        <Skeleton className="h-64 rounded-2xl" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    </div>
  );
}
