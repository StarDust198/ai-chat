"use client";

import { Button } from "@/components/ui/button";
import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Optionally log the error to an error reporting service
    console.error(error);
  }, [error]);

  return (
    <main className="flex h-full flex-col gap-4 items-center justify-center">
      <h2 className="text-center">Something went wrong in About!</h2>

      <Button onClick={() => reset()}>Try again</Button>
    </main>
  );
}
