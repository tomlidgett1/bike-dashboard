import Image from "next/image";
import { cn } from "@/lib/utils";

/** Deputy mark — circular crop for avatars and bento headers. */
export function DeputyLogo({ className }: { className?: string }) {
  return (
    <Image
      src="/deputy.png"
      alt="Deputy"
      width={225}
      height={225}
      className={cn("rounded-full object-cover", className)}
    />
  );
}
