import { cn } from "@/lib/utils";
import { Star } from "@/components/layout/app-sidebar/dashboard-icons";

/** Restrained Google Reviews mark for the unified inbox source avatar. */
export function GoogleReviewsLogo({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "flex h-full w-full items-center justify-center bg-white text-gray-700",
        className,
      )}
      aria-hidden
    >
      <Star className="h-4 w-4" />
    </span>
  );
}
