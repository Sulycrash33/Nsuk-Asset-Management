import { Skeleton } from "@/components/ui/skeleton";

export default function AssetDetailLoading() {
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Skeleton className="h-4 w-32" />
      <Skeleton className="h-72 rounded-2xl" />
      <Skeleton className="h-40 rounded-2xl" />
      <Skeleton className="h-48 rounded-2xl" />
    </div>
  );
}
