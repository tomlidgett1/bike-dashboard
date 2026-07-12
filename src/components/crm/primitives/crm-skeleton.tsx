import { cn } from "@/lib/utils";

function Line({ className }: { className?: string }) {
  return <div className={cn("h-3 animate-pulse rounded-md bg-gray-100", className)} />;
}

export function CrmSkeleton({
  variant = "cards",
  count = 4,
  className,
}: {
  variant?: "cards" | "rows" | "profile";
  count?: number;
  className?: string;
}) {
  if (variant === "profile") {
    return (
      <div className={cn("space-y-5 p-4 md:p-6", className)} aria-label="Loading customer">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 animate-pulse rounded-md bg-gray-100" />
          <div className="w-full max-w-sm space-y-2">
            <Line className="h-4 w-1/2" />
            <Line className="w-3/4" />
          </div>
        </div>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <div className="space-y-3">
            {Array.from({ length: count }).map((_, index) => (
              <div key={index} className="flex gap-3">
                <div className="h-8 w-8 animate-pulse rounded-md bg-gray-100" />
                <div className="flex-1 space-y-2 py-1">
                  <Line className="w-2/5" />
                  <Line className="w-4/5" />
                </div>
              </div>
            ))}
          </div>
          <div className="h-48 animate-pulse rounded-md bg-gray-100" />
        </div>
      </div>
    );
  }

  return (
    <div className={cn("space-y-3", className)} aria-label="Loading CRM content">
      {Array.from({ length: count }).map((_, index) => (
        <div
          key={index}
          className={cn(
            "animate-pulse rounded-md bg-white ring-1 ring-inset ring-gray-200",
            variant === "rows" ? "h-[4.75rem]" : "h-36",
          )}
        >
          <div className="space-y-2 p-4">
            <Line className="w-2/5" />
            <Line className="w-4/5" />
            {variant === "cards" ? <Line className="mt-5 w-1/3" /> : null}
          </div>
        </div>
      ))}
    </div>
  );
}
