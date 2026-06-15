"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { HomeV2ChatInput } from "@/components/genie/homev2-chat-input";
import { queueHomeV2Prompt } from "@/lib/genie/homev2-navigation";
import { cn } from "@/lib/utils";

export function StoreSettingsGenieSearch({ className }: { className?: string }) {
  const router = useRouter();
  const [value, setValue] = React.useState("");

  const submitPrompt = React.useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed) return;
    if (!queueHomeV2Prompt(trimmed)) return;
    setValue("");
    router.push("/settings/store/home");
  }, [router, value]);

  return (
    <div
      className={cn(
        "w-full overflow-hidden rounded-full bg-gray-100 shadow-sm ring-1 ring-black/5",
        className,
      )}
    >
      <HomeV2ChatInput
        header
        compact
        floating
        value={value}
        onChange={setValue}
        onSubmit={submitPrompt}
        placeholder="Ask Genie anything"
        showDisclaimer={false}
      />
    </div>
  );
}
