import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/cn";

export default function Loading() {
  const isFullscreenMode = false;

  return (
    <div
      className={cn(
        "p-4 flex flex-col gap-4",
        isFullscreenMode && "w-full grow",
      )}
    >
      <Skeleton className="h-8 w-40" />

      <Skeleton className="h-6 w-80" />

      <Skeleton className="h-6 w-96" />
    </div>
  );
}
