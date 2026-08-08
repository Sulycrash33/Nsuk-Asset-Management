import { Skeleton, SkeletonPageHeader, SkeletonRows } from "@/components/ui/skeleton";

export default function SearchLoading() {
  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <SkeletonPageHeader />
      <Skeleton className="h-12 rounded-xl" />
      <SkeletonRows count={4} />
    </div>
  );
}
