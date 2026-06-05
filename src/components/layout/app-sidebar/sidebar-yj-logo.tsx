"use client";

import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";

export function SidebarYjLogo() {
  return (
    <Link
      href="/marketplace"
      aria-label="Yellow Jersey marketplace"
      className={cn(
        "flex h-full w-full items-center px-0.5 transition-opacity hover:opacity-80",
        "group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
      )}
    >
      <Image
        src="/yjlogo.png"
        alt="Yellow Jersey"
        width={500}
        height={60}
        className="h-5 w-auto"
        priority
      />
    </Link>
  );
}
