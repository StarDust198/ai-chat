import { cn } from "@/lib/cn";
import { ReactNode } from "react";

// Legacy, is not used
export function ChatBubble({
  role,
  className,
  children,
}: {
  role: "user" | "assistant";
  children: ReactNode;
  className?: string;
}) {
  const isUser = role === "user";

  return (
    <div
      className={cn(
        "rounded-lg px-3 py-2 text-sm whitespace-pre-wrap",
        isUser
          ? "bg-primary text-primary-foreground"
          : "bg-muted text-foreground",
        className,
      )}
    >
      {children}
    </div>
  );
}
