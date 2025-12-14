"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Ticket, ChevronRight, Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAuth } from "@/components/providers/auth-provider";
import { MobileTicketCard } from "@/components/support";

interface SupportTicket {
  id: string;
  ticket_number: string;
  category: string;
  status: string;
  subject: string;
  created_at: string;
  updated_at: string;
  messageCount?: number;
  purchase?: {
    order_number: string;
    product?: {
      display_name?: string;
      description?: string;
      primary_image_url?: string;
      cached_image_url?: string;
    };
  };
}

interface HelpTicketPreviewProps {
  className?: string;
  maxTickets?: number;
}

export function HelpTicketPreview({ className, maxTickets = 3 }: HelpTicketPreviewProps) {
  const router = useRouter();
  const { user } = useAuth();
  const [tickets, setTickets] = React.useState<SupportTicket[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    async function fetchTickets() {
      if (!user) {
        setLoading(false);
        return;
      }

      try {
        const res = await fetch("/api/support/tickets");
        if (!res.ok) throw new Error("Failed to fetch tickets");
        const data = await res.json();
        setTickets(data.tickets?.slice(0, maxTickets) || []);
      } catch (err) {
        console.error("Failed to fetch tickets:", err);
        setError("Could not load tickets");
      } finally {
        setLoading(false);
      }
    }

    fetchTickets();
  }, [user, maxTickets]);

  // Not logged in
  if (!user) {
    return null;
  }

  // Loading
  if (loading) {
    return (
      <div className={cn("bg-white rounded-md border border-gray-200 p-6", className)}>
        <div className="flex items-center justify-center gap-2 text-gray-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm">Loading tickets...</span>
        </div>
      </div>
    );
  }

  // Error
  if (error) {
    return (
      <div className={cn("bg-white rounded-md border border-gray-200 p-6", className)}>
        <div className="flex items-center justify-center gap-2 text-gray-400">
          <AlertCircle className="h-4 w-4" />
          <span className="text-sm">{error}</span>
        </div>
      </div>
    );
  }

  // No tickets
  if (tickets.length === 0) {
    return (
      <div className={cn("bg-white rounded-md border border-gray-200 p-5", className)}>
        <div className="flex items-center gap-3 mb-3">
          <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
            <Ticket className="h-4 w-4 text-gray-400" />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-900">My Support Tickets</p>
            <p className="text-xs text-gray-500">No open tickets</p>
          </div>
        </div>
        <p className="text-xs text-gray-500">
          If you need help with an order, you can open a support ticket from your purchases page.
        </p>
      </div>
    );
  }

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex items-center justify-between px-1">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
          My Support Tickets
        </h3>
        <button
          onClick={() => router.push("/settings/purchases?tab=tickets")}
          className="text-xs text-gray-600 hover:text-gray-900 font-medium flex items-center gap-0.5 cursor-pointer"
        >
          View All
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="space-y-2">
        {tickets.map((ticket) => (
          <MobileTicketCard
            key={ticket.id}
            ticket={ticket}
            onClick={() => router.push(`/settings/purchases?tab=tickets&ticket=${ticket.id}`)}
          />
        ))}
      </div>
    </div>
  );
}
