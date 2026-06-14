"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { HomeV2ChatInput } from "@/components/genie/homev2-chat-input";
import { queueHomeV2Prompt } from "@/lib/genie/homev2-navigation";
import { cn } from "@/lib/utils";

export function HomeGenieFloatingPrompt({
  position = "top",
  className,
}: {
  position?: "top" | "bottom";
  className?: string;
}) {
  const router = useRouter();
  const [input, setInput] = React.useState("");

  const submitPrompt = React.useCallback(() => {
    const trimmed = input.trim();
    if (!trimmed) return;
    if (!queueHomeV2Prompt(trimmed)) return;
    setInput("");
    router.push("/settings/store/home");
  }, [input, router]);

  const isTop = position === "top";

  return (
    <div
      className={cn(
        "sticky z-30 flex w-full justify-center pointer-events-none",
        isTop ? "top-0 -mx-1 pt-1 pb-5" : "bottom-0 mt-auto pt-20 pb-6 sm:pb-8",
        className,
      )}
    >
      <div className="pointer-events-auto relative w-full max-w-3xl px-1">
        <div
          aria-hidden
          className={cn(
            "pointer-events-none absolute -inset-x-6",
            isTop
              ? "-bottom-8 top-0 bg-gradient-to-b from-background from-35% via-background/90 to-transparent"
              : "-top-20 bottom-0 bg-gradient-to-t from-background from-30% via-background/85 to-transparent",
          )}
        />
        <div className="relative overflow-hidden rounded-full border-2 border-yellow-400 bg-gray-100 shadow-[0_2px_4px_rgba(0,0,0,0.04),0_8px_16px_rgba(0,0,0,0.06),0_16px_40px_rgba(0,0,0,0.08),0_24px_48px_rgba(234,179,8,0.18)] ring-1 ring-black/5">
          <HomeV2ChatInput
            compact
            floating
            value={input}
            onChange={setInput}
            onSubmit={submitPrompt}
            placeholder="Ask Genie anything"
            showDisclaimer={false}
          />
        </div>
      </div>
    </div>
  );
}
