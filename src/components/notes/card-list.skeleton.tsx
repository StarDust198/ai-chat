import { Skeleton } from "@/components/ui/skeleton";

export default function CardListSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {Array.from({ length: 8 }).map((card, i) => {
        return <Skeleton className="min-h-80" key={i} />;
      })}
    </div>
  );
}
