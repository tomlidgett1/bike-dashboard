"use client";

import { Bot } from "lucide-react";
import { useGenie } from "@/components/providers/genie-provider";
import { cn } from "@/lib/utils";
import { topbarActionClass } from "@/components/layout/topbar-nav-pills";

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
        topbarActionClass,
        "cursor-pointer",
        isOpen && "bg-muted text-foreground"
      )}
    >
      <Bot className="size-3.5 shrink-0" aria-hidden />
      <span className={cn("hidden md:inline", isOpen && "text-foreground")}>
        Agent
      </span>
    </button>
  );
}
