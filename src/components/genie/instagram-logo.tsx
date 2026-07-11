import Image from "next/image";
import { cn } from "@/lib/utils";

/** Instagram mark from public/insta.svg — full-bleed inside the source avatar. */
export function InstagramLogo({ className }: { className?: string }) {
  return (
    <Image
      src="/insta.svg"
      alt="Instagram"
      width={36}
      height={36}
      unoptimized
      className={cn("h-full w-full object-cover", className)}
    />
  );
}
