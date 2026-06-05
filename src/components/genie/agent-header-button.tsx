"use client";

import { Bot } from "lucide-react";
import { useGenie } from "@/components/providers/genie-provider";
import { cn } from "@/lib/utils";
import { topbarPillClass } from "@/components/layout/topbar-nav-pills";

export function AgentHeaderButton() {
  const { isOpen, openAgent, close } = useGenie();

  const handleClick = () => {
    if (isOpen) {
      close();
      return;
    }
    openAgent();
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={isOpen ? "Close Agent" : "Open Agent"}
      aria-pressed={isOpen}
      className={cn(
        topbarPillClass,
        "cursor-pointer",
        isOpen && "border-[#ffde59] bg-[#ffde59]/15 shadow-sm"
      )}
    >
      <Bot
        className={cn(
          "h-4 w-4 shrink-0",
          isOpen ? "text-gray-900" : "text-gray-500"
        )}
        aria-hidden
      />
      <span className="text-gray-900">Agent</span>
    </button>
  );
}
