"use client";

import * as React from "react";
import { CheckCircle2, AlertCircle, HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";

// ============================================================
// Confidence Badge Component
// Shows confidence level for AI-detected fields
// ============================================================

interface ConfidenceBadgeProps {
  confidence: number;
  size?: "sm" | "md";
  showIcon?: boolean;
  showPercentage?: boolean;
}

export function ConfidenceBadge({ 
  confidence, 
  size = "md", 
  showIcon = true,
  showPercentage = true 
}: ConfidenceBadgeProps) {
  const getColor = () => {
    if (confidence >= 90) return "text-gray-700 bg-gray-100 border-gray-200";
    if (confidence >= 70) return "text-gray-700 bg-gray-100 border-gray-200";
    return "text-gray-700 bg-gray-100 border-gray-200";
  };

  const getIcon = () => {
    if (confidence >= 90) return CheckCircle2;
    if (confidence >= 70) return AlertCircle;
    return HelpCircle;
  };

  const getLabel = () => {
    if (confidence >= 90) return "High confidence";
    if (confidence >= 70) return "Review recommended";
    return "Verify carefully";
  };

  const Icon = getIcon();
  const sizeClasses = size === "sm" ? "text-xs px-2 py-0.5" : "text-sm px-2.5 py-1";

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 font-medium rounded-md border",
        getColor(),
        sizeClasses
      )}
    >
      {showIcon && <Icon className="h-3.5 w-3.5" />}
      <span>{getLabel()}</span>
      {showPercentage && <span className="opacity-75">({confidence}%)</span>}
    </div>
  );
}

