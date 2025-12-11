"use client";

import * as React from "react";
import { ChevronRight, Lock } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

export type SettingsRowType = "navigation" | "toggle" | "readonly";

interface SettingsRowProps {
  icon?: React.ReactNode;
  label: string;
  value?: string;
  type?: SettingsRowType;
  checked?: boolean;
  onToggle?: (checked: boolean) => void;
  onClick?: () => void;
  description?: string;
  className?: string;
}

export function SettingsRow({
  icon,
  label,
  value,
  type = "navigation",
  checked,
  onToggle,
  onClick,
  description,
  className,
}: SettingsRowProps) {
  const isInteractive = type === "navigation" || type === "toggle";

  const content = (
    <div
      className={cn(
        "flex items-center gap-3 px-4 py-3.5 bg-white min-h-[52px]",
        isInteractive && "active:bg-gray-50 transition-colors",
        className
      )}
    >
      {/* Icon */}
      {icon && (
        <div className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-md bg-gray-100">
          {icon}
        </div>
      )}

      {/* Label and description */}
      <div className="flex-1 min-w-0">
        <span className="text-sm font-medium text-gray-900">{label}</span>
        {description && (
          <p className="text-xs text-gray-500 mt-0.5">{description}</p>
        )}
      </div>

      {/* Right side content based on type */}
      {type === "navigation" && (
        <div className="flex items-center gap-2 flex-shrink-0">
          {value && (
            <span className="text-sm text-gray-500 truncate max-w-[120px]">
              {value}
            </span>
          )}
          <ChevronRight className="h-4 w-4 text-gray-400" />
        </div>
      )}

      {type === "toggle" && (
        <Switch
          checked={checked}
          onCheckedChange={onToggle}
          onClick={(e) => e.stopPropagation()}
        />
      )}

      {type === "readonly" && (
        <div className="flex items-center gap-2 flex-shrink-0">
          {value && (
            <span className="text-sm text-gray-500 truncate max-w-[140px]">
              {value}
            </span>
          )}
          <Lock className="h-3.5 w-3.5 text-gray-400" />
        </div>
      )}
    </div>
  );

  if (type === "navigation" && onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="w-full text-left"
      >
        {content}
      </button>
    );
  }

  if (type === "toggle") {
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={() => onToggle?.(!checked)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggle?.(!checked);
          }
        }}
        className="w-full cursor-pointer"
      >
        {content}
      </div>
    );
  }

  return content;
}

// Section component for grouping rows
interface SettingsSectionProps {
  title?: string;
  children: React.ReactNode;
  className?: string;
}

export function SettingsSection({
  title,
  children,
  className,
}: SettingsSectionProps) {
  return (
    <div className={cn("", className)}>
      {title && (
        <h3 className="px-4 pb-2 pt-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">
          {title}
        </h3>
      )}
      <div className="bg-white divide-y divide-gray-100 rounded-md overflow-hidden">
        {children}
      </div>
    </div>
  );
}

