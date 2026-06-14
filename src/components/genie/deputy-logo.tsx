import Image from "next/image";
import { cn } from "@/lib/utils";

/** Deputy mark — scales cleanly from the 14px pill chip to the 16px progress avatar. */
export function DeputyLogo({ className }: { className?: string }) {
  return (
    <Image
      src="/deputy.png"
      alt="Deputy"
      width={225}
      height={225}
      className={cn("h-full w-full object-contain", className)}
    />
  );
}
