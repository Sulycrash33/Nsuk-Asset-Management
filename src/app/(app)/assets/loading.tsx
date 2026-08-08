import { Skeleton, SkeletonPageHeader, SkeletonRows } from "@/components/ui/skeleton";

export default function AssetsLoading() {
  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <SkeletonPageHeader />
      <Skeleton className="h-12 rounded-xl" />
      <SkeletonRows count={7} />
    </div>
  );
}
