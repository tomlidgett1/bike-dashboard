"use client";

import { Bot } from "lucide-react";
import { useGenie } from "@/components/providers/genie-provider";
import { Button } from "@/components/ui/button";
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
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={handleClick}
      aria-label={isOpen ? "Close Agent" : "Open Agent"}
      aria-pressed={isOpen}
      className={cn(
        "size-8 text-muted-foreground hover:text-foreground",
        isOpen && "bg-muted text-foreground",
      )}
    >
      <Bot className="size-4" />
    </Button>
  );
}
