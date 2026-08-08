import { Skeleton, SkeletonPageHeader } from "@/components/ui/skeleton";

export default function ActivityLoading() {
  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <SkeletonPageHeader />
      <div className="flex gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-7 w-20 rounded-full" />
        ))}
      </div>
      <Skeleton className="h-[30rem] rounded-2xl" />
    </div>
  );
}
