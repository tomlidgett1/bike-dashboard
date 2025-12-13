"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// ============================================================
// Types
// ============================================================

interface TicketStatusBadgeProps {
  status: string;
  className?: string;
}

// ============================================================
// Status Configuration
// ============================================================

const STATUS_CONFIG: Record<
  string,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline"; className?: string }
> = {
  open: {
    label: "Open",
    variant: "default",
    className: "bg-amber-500 hover:bg-amber-500",
  },
  awaiting_response: {
    label: "Awaiting Response",
    variant: "secondary",
    className: "bg-blue-100 text-blue-700 hover:bg-blue-100",
  },
  in_review: {
    label: "In Review",
    variant: "secondary",
    className: "bg-purple-100 text-purple-700 hover:bg-purple-100",
  },
  escalated: {
    label: "Escalated",
    variant: "destructive",
    className: "bg-red-500 hover:bg-red-500",
  },
  resolved: {
    label: "Resolved",
    variant: "default",
    className: "bg-green-500 hover:bg-green-500",
  },
  closed: {
    label: "Closed",
    variant: "outline",
    className: "text-gray-500",
  },
};

// ============================================================
// Component
// ============================================================

export function TicketStatusBadge({ status, className }: TicketStatusBadgeProps) {
  const config = STATUS_CONFIG[status] || {
    label: status,
    variant: "outline" as const,
  };

  return (
    <Badge
      variant={config.variant}
      className={cn("rounded-md", config.className, className)}
    >
      {config.label}
    </Badge>
  );
}

