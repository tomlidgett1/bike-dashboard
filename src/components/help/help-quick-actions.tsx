"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Package, Truck, MessageCircle, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/components/providers/auth-provider";

interface QuickAction {
  id: string;
  title: string;
  description: string;
  icon: React.ElementType;
  href?: string;
  onClick?: () => void;
  requiresAuth?: boolean;
}

interface HelpQuickActionsProps {
  onContactClick?: () => void;
  className?: string;
}

export function HelpQuickActions({ onContactClick, className }: HelpQuickActionsProps) {
  const router = useRouter();
  const { user } = useAuth();

  const actions: QuickAction[] = [
    {
      id: "report-problem",
      title: "Report a problem with an order",
      description: "Open a dispute or get help with a purchase",
      icon: Package,
      href: "/settings/purchases",
      requiresAuth: true,
    },
    {
      id: "track-order",
      title: "Track my order",
      description: "View shipping status and tracking info",
      icon: Truck,
      href: "/settings/purchases",
      requiresAuth: true,
    },
    {
      id: "contact-support",
      title: "Contact Support",
      description: "Get in touch with our support team",
      icon: MessageCircle,
      onClick: onContactClick,
    },
  ];

  const handleAction = (action: QuickAction) => {
    if (action.requiresAuth && !user) {
      // Could trigger auth modal here
      router.push("/marketplace");
      return;
    }

    if (action.onClick) {
      action.onClick();
    } else if (action.href) {
      router.push(action.href);
    }
  };

  return (
    <div className={cn("space-y-2", className)}>
      {actions.map((action) => {
        const Icon = action.icon;
        const isDisabled = action.requiresAuth && !user;

        return (
          <button
            key={action.id}
            onClick={() => handleAction(action)}
            disabled={isDisabled}
            className={cn(
              "w-full flex items-center gap-4 p-4 bg-white rounded-md border border-gray-200 text-left transition-all",
              isDisabled
                ? "opacity-50 cursor-not-allowed"
                : "hover:border-gray-300 hover:shadow-sm active:bg-gray-50"
            )}
          >
            <div className="flex-shrink-0 w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
              <Icon className="h-5 w-5 text-gray-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900">{action.title}</p>
              <p className="text-xs text-gray-500">{action.description}</p>
            </div>
            <ChevronRight className="h-5 w-5 text-gray-400 flex-shrink-0" />
          </button>
        );
      })}

      {/* Login prompt if not authenticated */}
      {!user && (
        <p className="text-xs text-gray-500 text-center pt-2">
          Sign in to report problems or track orders
        </p>
      )}
    </div>
  );
}

