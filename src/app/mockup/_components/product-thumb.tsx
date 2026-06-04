import { Bike, ImageOff } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Dependency-free product thumbnail. Renders a soft, photo-like tinted tile
 * (so the grid feels alive without external images) or a clear "needs image"
 * placeholder when the product has none.
 */
export function ProductThumb({
  hue,
  hasImage,
  className,
}: {
  hue: number;
  hasImage: boolean;
  className?: string;
}) {
  if (!hasImage) {
    return (
      <div
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-md border border-dashed border-border bg-muted/40 text-muted-foreground",
          className
        )}
      >
        <ImageOff className="size-4" />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex size-10 shrink-0 items-center justify-center rounded-md ring-1 ring-black/5",
        className
      )}
      style={{
        backgroundImage: `linear-gradient(135deg, hsl(${hue} 48% 90%), hsl(${hue} 42% 78%))`,
      }}
    >
      <Bike className="size-5" style={{ color: `hsl(${hue} 38% 40%)` }} />
    </div>
  );
}
