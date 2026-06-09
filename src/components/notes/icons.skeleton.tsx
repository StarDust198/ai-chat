import { Skeleton } from "@/components/ui/skeleton";

export default function IconsSkeleton() {
  return (
    <div className="flex gap-2">
      <Skeleton className="h-8 w-8" />
      <Skeleton className="h-8 w-8" />
      <Skeleton className="h-8 w-8" />
    </div>
  );
}
