import Link from "next/link";
import { FaceFrownIcon } from "@heroicons/react/24/outline";
import { buttonVariants } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex flex-col flex-1 gap-1 items-center justify-center bg-black text-white">
      <FaceFrownIcon className="w-10 text-gray-400" />
      <h2 className="text-xl font-semibold">404</h2>
      <p>Page not found</p>

      <Link
        href="/chat"
        className={buttonVariants({
          variant: "ghost",
        })}
      >
        Go Back
      </Link>
    </main>
  );
}
