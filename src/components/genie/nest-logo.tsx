import Image from "next/image";
import { cn } from "@/lib/utils";

export function NestLogo({ className }: { className?: string }) {
  return (
    <Image
      src="/nest-logo.png"
      alt="Nest"
      width={32}
      height={32}
      unoptimized
      className={cn("h-[18px] w-[18px] rounded-full object-cover", className)}
    />
  );
}
