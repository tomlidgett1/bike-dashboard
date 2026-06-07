import Image from "next/image";
import { cn } from "@/lib/utils";

/** Gmail mark — source asset is 1280×960; keep aspect ratio inside the avatar circle. */
export function GmailLogo({ className }: { className?: string }) {
  return (
    <Image
      src="/gmail.png"
      alt="Gmail"
      width={1280}
      height={960}
      className={cn("h-[18px] w-auto max-w-[22px] object-contain", className)}
    />
  );
}
