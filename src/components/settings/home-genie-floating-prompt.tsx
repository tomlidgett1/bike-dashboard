"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { HomeV2ChatInput } from "@/components/genie/homev2-chat-input";
import { queueHomeV2Prompt } from "@/lib/genie/homev2-navigation";

export function HomeGenieFloatingPrompt() {
  const router = useRouter();
  const [input, setInput] = React.useState("");

  const submitPrompt = React.useCallback(() => {
    const trimmed = input.trim();
    if (!trimmed) return;
    if (!queueHomeV2Prompt(trimmed)) return;
    setInput("");
    router.push("/settings/store/homev2");
  }, [input, router]);

  return (
    <div className="sticky bottom-0 z-30 mt-auto flex w-full justify-center pb-6 pt-20 pointer-events-none sm:pb-8">
      <div className="pointer-events-auto relative w-full max-w-3xl">
        <div
          aria-hidden
          className="pointer-events-none absolute -inset-x-6 -top-20 bottom-0 bg-gradient-to-t from-background from-30% via-background/85 to-transparent"
        />
        <div className="relative -translate-y-1 overflow-hidden rounded-full border-2 border-yellow-400 bg-gray-100 shadow-[0_2px_4px_rgba(0,0,0,0.04),0_8px_16px_rgba(0,0,0,0.06),0_16px_40px_rgba(0,0,0,0.08),0_24px_48px_rgba(234,179,8,0.18)] ring-1 ring-black/5">
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
