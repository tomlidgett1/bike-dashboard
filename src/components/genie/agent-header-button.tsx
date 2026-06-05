"use client";

import { useGenie } from "@/components/providers/genie-provider";
import { cn } from "@/lib/utils";
import { topbarPillClass } from "@/components/layout/topbar-nav-pills";
import AIMotionOrb from "./ai-motion-orb";

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
      <AIMotionOrb size={22} />
      <span className="text-gray-900">Agent</span>
    </button>
  );
}
