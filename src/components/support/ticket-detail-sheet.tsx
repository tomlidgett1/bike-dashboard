"use client";

import * as React from "react";
import Image from "next/image";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Package,
  Send,
  Loader2,
  Clock,
  User,
  ArrowLeft,
  CheckCircle2,
} from "lucide-react";
import { TicketStatusBadge } from "./ticket-status-badge";
import { cn } from "@/lib/utils";

// ============================================================
// Types
// ============================================================

interface Message {
  id: string;
  sender_id: string;
  sender_type: string;
  message: string;
  attachments?: string;
  created_at: string;
  sender?: {
    user_id: string;
    name?: string;
    business_name?: string;
    logo_url?: string;
  };
}

interface HistoryItem {
  id: string;
  action: string;
  created_at: string;
  new_value?: Record<string, unknown>;
  performer?: {
    name?: string;
    business_name?: string;
  };
}

interface TicketDetailSheetProps {
  isOpen: boolean;
  onClose: () => void;
  ticketId: string | null;
}

// ============================================================
// Helper Functions
// ============================================================

function formatDate(date: string): string {
  return new Date(date).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatTime(date: string): string {
  return new Date(date).toLocaleTimeString("en-AU", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDateTime(date: string): string {
  return `${formatDate(date)} at ${formatTime(date)}`;
}

function getCategoryLabel(category: string): string {
  const labels: Record<string, string> = {
    item_not_received: "Item Not Received",
    item_not_as_described: "Not as Described",
    damaged: "Damaged Item",
    wrong_item: "Wrong Item",
    refund_request: "Refund Request",
    shipping_issue: "Shipping Issue",
    general_question: "General Question",
  };
  return labels[category] || category;
}

function getActionLabel(action: string): string {
  const labels: Record<string, string> = {
    created: "Ticket created",
    status_changed: "Status updated",
    message_added: "Reply added",
    resolved: "Ticket resolved",
    reopened: "Ticket reopened",
    escalated: "Ticket escalated",
    assigned: "Ticket assigned",
  };
  return labels[action] || action;
}

// ============================================================
// Component
// ============================================================

export function TicketDetailSheet({
  isOpen,
  onClose,
  ticketId,
}: TicketDetailSheetProps) {
  const [ticket, setTicket] = React.useState<Record<string, unknown> | null>(null);
  const [messages, setMessages] = React.useState<Message[]>([]);
  const [history, setHistory] = React.useState<HistoryItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [replyMessage, setReplyMessage] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState<"messages" | "timeline">("messages");
  const messagesEndRef = React.useRef<HTMLDivElement>(null);

  // Fetch ticket details
  React.useEffect(() => {
    if (!isOpen || !ticketId) return;

    const fetchTicket = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/support/tickets/${ticketId}`);
        const data = await res.json();

        if (res.ok) {
          setTicket(data.ticket);
          setMessages(data.messages || []);
          setHistory(data.history || []);
        }
      } catch (error) {
        console.error("Failed to fetch ticket:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchTicket();
  }, [isOpen, ticketId]);

  // Scroll to bottom of messages
  React.useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSendReply = async () => {
    if (!replyMessage.trim() || !ticketId || sending) return;

    setSending(true);
    try {
      const res = await fetch(`/api/support/tickets/${ticketId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: replyMessage.trim() }),
      });

      if (res.ok) {
        const data = await res.json();
        setMessages((prev) => [...prev, data.message]);
        setReplyMessage("");
      }
    } catch (error) {
      console.error("Failed to send reply:", error);
    } finally {
      setSending(false);
    }
  };

  const product = (ticket?.product || (ticket?.purchase as Record<string, unknown>)?.product) as Record<string, unknown> | undefined;
  const productImage = product?.cached_image_url || product?.primary_image_url;
  const productName = (product?.display_name || product?.description || "Product") as string;
  const canReply = ticket && !["closed", "resolved"].includes(ticket.status as string);

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-lg p-0 flex flex-col"
      >
        {loading ? (
          <div className="flex-1 flex flex-col">
            <VisuallyHidden>
              <SheetTitle>Loading ticket details</SheetTitle>
              <SheetDescription>Please wait while we load the ticket information</SheetDescription>
            </VisuallyHidden>
            <div className="flex-1 flex items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            </div>
          </div>
        ) : !ticket ? (
          <div className="flex-1 flex flex-col">
            <VisuallyHidden>
              <SheetTitle>Ticket not found</SheetTitle>
              <SheetDescription>The requested ticket could not be found</SheetDescription>
            </VisuallyHidden>
            <div className="flex-1 flex items-center justify-center">
              <p className="text-gray-500">Ticket not found</p>
            </div>
          </div>
        ) : (
          <>
            {/* Header */}
            <SheetHeader className="px-4 py-3 border-b">
              <VisuallyHidden>
                <SheetDescription>Support ticket details and conversation</SheetDescription>
              </VisuallyHidden>
              <div className="flex items-center gap-3">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onClose}
                  className="h-8 w-8 rounded-md sm:hidden"
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <div className="flex-1 min-w-0">
                  <SheetTitle className="text-base line-clamp-1">
                    {ticket.subject as string}
                  </SheetTitle>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {ticket.ticket_number as string}
                  </p>
                </div>
                <TicketStatusBadge status={ticket.status as string} />
              </div>
            </SheetHeader>

            {/* Product Card */}
            <div className="px-4 py-3 bg-gray-50 border-b">
              <div className="flex gap-3">
                <div className="relative h-12 w-12 rounded-md overflow-hidden bg-gray-200 flex-shrink-0">
                  {productImage ? (
                    <Image
                      src={productImage as string}
                      alt={productName}
                      fill
                      className="object-cover"
                      sizes="48px"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <Package className="h-5 w-5 text-gray-400" />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm text-gray-900 line-clamp-1">
                    {productName}
                  </p>
                  <p className="text-xs text-gray-500">
                    {getCategoryLabel(ticket.category as string)} · {formatDate(ticket.created_at as string)}
                  </p>
                </div>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex border-b">
              <button
                onClick={() => setActiveTab("messages")}
                className={cn(
                  "flex-1 py-2.5 text-sm font-medium transition-colors",
                  activeTab === "messages"
                    ? "text-primary border-b-2 border-primary"
                    : "text-gray-500 hover:text-gray-700"
                )}
              >
                Messages ({messages.length})
              </button>
              <button
                onClick={() => setActiveTab("timeline")}
                className={cn(
                  "flex-1 py-2.5 text-sm font-medium transition-colors",
                  activeTab === "timeline"
                    ? "text-primary border-b-2 border-primary"
                    : "text-gray-500 hover:text-gray-700"
                )}
              >
                Timeline
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto">
              {activeTab === "messages" ? (
                <div className="p-4 space-y-4">
                  {messages.map((msg) => {
                    const isSupport = msg.sender_type === "support";
                    const isSeller = msg.sender_type === "seller";
                    const senderName =
                      msg.sender?.business_name ||
                      msg.sender?.name ||
                      (isSupport ? "Yellow Jersey Support" : isSeller ? "Seller" : "You");

                    return (
                      <div
                        key={msg.id}
                        className={cn(
                          "flex gap-3",
                          msg.sender_type === "buyer" && "flex-row-reverse"
                        )}
                      >
                        <Avatar className="h-8 w-8 flex-shrink-0">
                          {msg.sender?.logo_url && (
                            <AvatarImage src={msg.sender.logo_url} />
                          )}
                          <AvatarFallback className={cn(
                            isSupport && "bg-amber-100 text-amber-700"
                          )}>
                            {isSupport ? "YJ" : <User className="h-4 w-4" />}
                          </AvatarFallback>
                        </Avatar>
                        <div
                          className={cn(
                            "flex-1 max-w-[80%]",
                            msg.sender_type === "buyer" && "flex flex-col items-end"
                          )}
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs font-medium text-gray-900">
                              {senderName}
                            </span>
                            <span className="text-xs text-gray-400">
                              {formatTime(msg.created_at)}
                            </span>
                          </div>
                          <div
                            className={cn(
                              "rounded-md px-3 py-2 text-sm",
                              msg.sender_type === "buyer"
                                ? "bg-primary text-primary-foreground"
                                : "bg-gray-100 text-gray-900"
                            )}
                          >
                            {msg.message}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={messagesEndRef} />
                </div>
              ) : (
                <div className="p-4">
                  <div className="space-y-0">
                    {history.map((item, index) => (
                      <div key={item.id} className="flex gap-3">
                        <div className="flex flex-col items-center">
                          <div
                            className={cn(
                              "h-2.5 w-2.5 rounded-full mt-1.5",
                              index === 0 ? "bg-primary" : "bg-gray-300"
                            )}
                          />
                          {index < history.length - 1 && (
                            <div className="w-px flex-1 bg-gray-200 my-1" />
                          )}
                        </div>
                        <div className="flex-1 pb-4">
                          <p className="text-sm font-medium text-gray-900">
                            {getActionLabel(item.action)}
                          </p>
                          {typeof item.new_value?.status === 'string' && item.new_value.status && (
                            <TicketStatusBadge
                              status={item.new_value.status}
                              className="mt-1"
                            />
                          )}
                          <p className="text-xs text-gray-500 mt-1">
                            {formatDateTime(item.created_at)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Reply Box */}
            {canReply && activeTab === "messages" && (
              <div className="border-t bg-white p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
                <div className="flex gap-2">
                  <Textarea
                    value={replyMessage}
                    onChange={(e) => setReplyMessage(e.target.value)}
                    placeholder="Type your reply..."
                    rows={2}
                    className="rounded-md resize-none flex-1"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleSendReply();
                      }
                    }}
                  />
                  <Button
                    onClick={handleSendReply}
                    disabled={!replyMessage.trim() || sending}
                    size="icon"
                    className="h-auto rounded-md"
                  >
                    {sending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
            )}

            {/* Resolved Actions */}
            {ticket.status === "resolved" && (
              <div className="border-t bg-green-50 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
                <div className="flex items-center gap-3 mb-3">
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                  <p className="font-medium text-green-900">This ticket has been resolved</p>
                </div>
                {typeof ticket.resolution === 'string' && ticket.resolution && (
                  <p className="text-sm text-green-700 mb-3">
                    Resolution: {ticket.resolution}
                  </p>
                )}
              </div>
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

