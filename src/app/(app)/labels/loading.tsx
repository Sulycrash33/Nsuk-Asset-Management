import { Skeleton, SkeletonPageHeader } from "@/components/ui/skeleton";

export default function LabelsLoading() {
  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <SkeletonPageHeader />
      <Skeleton className="h-32 rounded-2xl" />
      <Skeleton className="h-96 rounded-2xl" />
    </div>
  );
}
