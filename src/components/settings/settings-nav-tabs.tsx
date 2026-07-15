"use client";

import * as React from "react";
import { SlidingNavTabs } from "@/components/layout/sliding-nav-tabs";

export function SettingsNavTabs<T extends string>({
  items,
  value,
  onChange,
  size = "lg",
  layoutId,
}: {
  items: readonly { id: T; label: string; icon: React.ComponentType<{ className?: string }> }[];
  value: T;
  onChange: (id: T) => void;
  size?: "sm" | "lg";
  layoutId?: string;
}) {
  return (
    <SlidingNavTabs
      items={items}
      value={value}
      onChange={onChange}
      size={size}
      layoutId={layoutId}
    />
  );
}
