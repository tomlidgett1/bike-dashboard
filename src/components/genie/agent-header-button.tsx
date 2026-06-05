"use client";

import { Bot } from "lucide-react";
import { useGenie } from "@/components/providers/genie-provider";
import { cn } from "@/lib/utils";

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
        "inline-flex items-center gap-2 rounded-md border px-2.5 py-1.5",
        "font-mono text-xs font-medium tracking-wide transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 focus-visible:ring-offset-2",
        isOpen
          ? "border-gray-900 bg-gray-900 text-white shadow-sm"
          : "cursor-pointer border-gray-200 bg-white text-gray-900 hover:bg-gray-50"
      )}
    >
      <span
        className={cn(
          "relative flex h-6 w-6 shrink-0 items-center justify-center rounded-md",
          isOpen ? "bg-white/15" : "bg-gray-900"
        )}
      >
        <Bot className="h-3.5 w-3.5 text-white" strokeWidth={2.25} />
        <span
          className={cn(
            "absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full ring-2",
            isOpen ? "bg-gray-400 ring-gray-900" : "bg-gray-300 ring-gray-900"
          )}
          aria-hidden
        />
      </span>
      <span className="pr-0.5 uppercase">Agent</span>
    </button>
  );
}
