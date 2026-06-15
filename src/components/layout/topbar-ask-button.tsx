"use client";

import { MessageSquare } from "lucide-react";
import { useGenie } from "@/components/providers/genie-provider";
import { topbarOutlinePillClass, dashboardHeaderControlActiveClass } from "@/components/layout/topbar-nav-pills";
import { cn } from "@/lib/utils";

export function TopbarAskButton() {
  const { isOpen, openAgent, close } = useGenie();

  return (
    <button
      type="button"
      onClick={() => {
        if (isOpen) {
          close();
          return;
        }
        openAgent();
      }}
      aria-label={isOpen ? "Close Ask" : "Open Ask"}
      aria-pressed={isOpen}
      className={cn(topbarOutlinePillClass, isOpen && dashboardHeaderControlActiveClass)}
    >
      <MessageSquare className="size-3.5" />
      Ask
    </button>
  );
}
