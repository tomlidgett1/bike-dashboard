"use client";

import * as React from "react";
import { HomeV2ChatInput } from "@/components/genie/homev2-chat-input";
import { useGenieTransition } from "@/components/layout/genie-transition";
import { cn } from "@/lib/utils";

export function StoreSettingsGenieSearch({ className }: { className?: string }) {
  const { startTransition } = useGenieTransition();
  const [value, setValue] = React.useState("");

  const submitPrompt = React.useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed) return;
    setValue("");
    startTransition(trimmed);
  }, [startTransition, value]);

  return (
    <div
      className={cn(
        "group w-full overflow-hidden rounded-full bg-white shadow-sm ring-1 ring-black/10 transition-shadow hover:shadow-md",
        className,
      )}
    >
      <HomeV2ChatInput
        header
        compact
        floating
        placeholderShimmerOnHover
        value={value}
        onChange={setValue}
        onSubmit={submitPrompt}
        placeholder="Ask Genie anything"
        showDisclaimer={false}
      />
    </div>
  );
}
