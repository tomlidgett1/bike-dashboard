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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  CircleDollarSign,
  Clock,
  Handshake,
  Loader2,
  Package,
  Scale,
  Send,
  ShieldCheck,
  User,
} from "lucide-react";
import { TicketStatusBadge } from "./ticket-status-badge";
import { cn } from "@/lib/utils";

type UserRole = "buyer" | "seller" | "admin";
type ResolutionType = "refunded" | "partial_refund" | "replaced" | "no_action" | "other";

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

interface ProductSummary {
  id?: string;
  display_name?: string | null;
  description?: string | null;
  cached_image_url?: string | null;
  primary_image_url?: string | null;
}

interface PurchaseSummary {
  id: string;
  order_number?: string | null;
  total_amount?: number | null;
  item_price?: number | null;
  status?: string | null;
  funds_status?: string | null;
  product?: ProductSummary | null;
}

interface TicketDetail {
  id: string;
  ticket_number: string;
  subject: string;
  status: string;
  category: string;
  created_at: string;
  description?: string | null;
  resolution?: string | null;
  resolution_type?: ResolutionType | null;
  resolution_amount?: number | null;
  resolution_offered_at?: string | null;
  resolution_accepted_at?: string | null;
  resolution_actioned_at?: string | null;
  resolution_error?: string | null;
  stripe_refund_id?: string | null;
  stripe_transfer_reversal_id?: string | null;
  seller_response_due_at?: string | null;
  buyer_response_due_at?: string | null;
  escalated_at?: string | null;
  purchase?: PurchaseSummary | null;
  product?: ProductSummary | null;
}

interface TicketDetailSheetProps {
  isOpen: boolean;
  onClose: () => void;
  ticketId: string | null;
}

const ACTIVE_STATUSES = new Set(["open", "awaiting_response", "in_review", "escalated"]);

const RESOLUTION_OPTIONS: { value: ResolutionType; label: string; helper: string }[] = [
  { value: "refunded", label: "Full refund", helper: "Return the full order value to the buyer." },
  { value: "partial_refund", label: "Partial refund", helper: "Refund part of the order and close the claim." },
  { value: "replaced", label: "Replacement", helper: "Send a replacement or agreed substitute." },
  { value: "no_action", label: "Release payment", helper: "Close the claim and release funds to the seller." },
  { value: "other", label: "Other agreement", helper: "Use when the parties agree a custom outcome." },
];

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

function formatMoney(amount?: number | null): string {
  if (typeof amount !== "number") return "$0.00";
  return amount.toLocaleString("en-AU", {
    style: "currency",
    currency: "AUD",
  });
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
    resolution_offered: "Resolution offered",
    resolution_accepted: "Resolution accepted",
    resolution_actioned: "Resolution actioned",
    refund_processed: "Refund processed",
    transfer_reversed: "Transfer reversed",
  };
  return labels[action] || action.replace(/_/g, " ");
}

function getResolutionLabel(type?: ResolutionType | null): string {
  return RESOLUTION_OPTIONS.find((option) => option.value === type)?.label || "Resolution";
}

function dueLabel(ticket: TicketDetail, role: UserRole): string | null {
  const dueAt = role === "buyer" ? ticket.buyer_response_due_at : ticket.seller_response_due_at;
  if (!dueAt || !ACTIVE_STATUSES.has(ticket.status)) return null;
  return `Response due ${formatDate(dueAt)}`;
}

export function TicketDetailSheet({
  isOpen,
  onClose,
  ticketId,
}: TicketDetailSheetProps) {
  const [ticket, setTicket] = React.useState<TicketDetail | null>(null);
  const [messages, setMessages] = React.useState<Message[]>([]);
  const [history, setHistory] = React.useState<HistoryItem[]>([]);
  const [userRole, setUserRole] = React.useState<UserRole>("buyer");
  const [loading, setLoading] = React.useState(true);
  const [replyMessage, setReplyMessage] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState<"messages" | "timeline">("messages");
  const [resolutionType, setResolutionType] = React.useState<ResolutionType>("refunded");
  const [resolutionAmount, setResolutionAmount] = React.useState("");
  const [resolutionMessage, setResolutionMessage] = React.useState("");
  const [actionLoading, setActionLoading] = React.useState<null | "propose" | "accept" | "escalate">(null);
  const [actionError, setActionError] = React.useState<string | null>(null);
  const messagesEndRef = React.useRef<HTMLDivElement>(null);

  const fetchTicket = React.useCallback(async () => {
    if (!isOpen || !ticketId) return;

    setLoading(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/support/tickets/${ticketId}`);
      const data = await res.json();

      if (res.ok) {
        setTicket(data.ticket);
        setMessages(data.messages || []);
        setHistory(data.history || []);
        setUserRole(data.userRole || "buyer");
      }
    } catch (error) {
      console.error("Failed to fetch ticket:", error);
    } finally {
      setLoading(false);
    }
  }, [isOpen, ticketId]);

  React.useEffect(() => {
    if (!isOpen || !ticketId) return;
    setReplyMessage("");
    setResolutionMessage("");
    setResolutionAmount("");
    setResolutionType("refunded");
    fetchTicket();
  }, [fetchTicket, isOpen, ticketId]);

  React.useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const performResolutionAction = async (
    action: "propose" | "accept" | "escalate",
    payload: Record<string, unknown> = {}
  ) => {
    if (!ticketId || actionLoading) return;

    setActionLoading(action);
    setActionError(null);
    try {
      const res = await fetch(`/api/support/tickets/${ticketId}/resolution`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...payload }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setActionError(data.error || "Action failed");
        return;
      }

      setResolutionMessage("");
      setResolutionAmount("");
      await fetchTicket();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Action failed");
    } finally {
      setActionLoading(null);
    }
  };

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
        fetchTicket();
      }
    } catch (error) {
      console.error("Failed to send reply:", error);
    } finally {
      setSending(false);
    }
  };

  const product = ticket?.product || ticket?.purchase?.product || undefined;
  const productImage = product?.cached_image_url || product?.primary_image_url;
  const productName = product?.display_name || product?.description || "Product";
  const canReply = Boolean(ticket && !["closed", "resolved"].includes(ticket.status));
  const isActive = Boolean(ticket && ACTIVE_STATUSES.has(ticket.status));
  const pendingOffer = Boolean(ticket?.resolution_type && ticket.resolution_offered_at && !ticket.resolution_accepted_at && ticket.status !== "resolved");
  const canOfferResolution = Boolean(ticket && isActive && (userRole === "seller" || userRole === "admin"));
  const canAcceptResolution = Boolean(ticket && pendingOffer && (userRole === "buyer" || userRole === "admin"));
  const canEscalate = Boolean(ticket && isActive && ticket.status !== "escalated");
  const responseDue = ticket ? dueLabel(ticket, userRole) : null;
  const selectedOption = RESOLUTION_OPTIONS.find((option) => option.value === resolutionType);

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-xl p-0 flex flex-col"
      >
        {loading ? (
          <div className="flex-1 flex flex-col">
            <VisuallyHidden>
              <SheetTitle>Loading ticket details</SheetTitle>
              <SheetDescription>Please wait while we load the ticket information</SheetDescription>
            </VisuallyHidden>
            <div className="flex-1 flex items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          </div>
        ) : !ticket ? (
          <div className="flex-1 flex flex-col">
            <VisuallyHidden>
              <SheetTitle>Ticket not found</SheetTitle>
              <SheetDescription>The requested ticket could not be found</SheetDescription>
            </VisuallyHidden>
            <div className="flex-1 flex items-center justify-center">
              <p className="text-xs text-muted-foreground">Ticket not found</p>
            </div>
          </div>
        ) : (
          <>
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
                  <SheetTitle className="text-sm font-semibold line-clamp-1">
                    {ticket.subject}
                  </SheetTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {ticket.ticket_number}
                  </p>
                </div>
                <TicketStatusBadge status={ticket.status} />
              </div>
            </SheetHeader>

            <div className="px-4 py-3 border-b flex items-center gap-3">
              <div className="relative h-10 w-10 rounded-md overflow-hidden bg-muted flex-shrink-0">
                {productImage ? (
                  <Image
                    src={productImage}
                    alt={productName}
                    fill
                    className="object-cover"
                    sizes="40px"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <Package className="h-4 w-4 text-muted-foreground" />
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-foreground line-clamp-1">{productName}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {getCategoryLabel(ticket.category)} · {formatDate(ticket.created_at)}
                </p>
              </div>
              {ticket.purchase?.order_number && (
                <Badge variant="secondary" className="rounded-md font-normal">
                  {ticket.purchase.order_number}
                </Badge>
              )}
            </div>

            <div className="px-4 py-3 border-b bg-muted/20 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="rounded-md gap-1.5 bg-background">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  Funds {ticket.purchase?.funds_status === "disputed" ? "held in dispute" : ticket.purchase?.funds_status || "tracked"}
                </Badge>
                {responseDue && (
                  <Badge variant="outline" className="rounded-md gap-1.5 bg-background">
                    <Clock className="h-3.5 w-3.5" />
                    {responseDue}
                  </Badge>
                )}
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-md border bg-background p-2">
                  <ShieldCheck className="h-4 w-4 text-green-700" />
                  <p className="mt-1 text-[11px] font-medium text-foreground">Hold funds</p>
                  <p className="text-[11px] text-muted-foreground leading-snug">Money stays frozen while the claim is active.</p>
                </div>
                <div className="rounded-md border bg-background p-2">
                  <Handshake className="h-4 w-4 text-blue-700" />
                  <p className="mt-1 text-[11px] font-medium text-foreground">Resolve first</p>
                  <p className="text-[11px] text-muted-foreground leading-snug">Seller can offer refund, replacement, or release.</p>
                </div>
                <div className="rounded-md border bg-background p-2">
                  <Scale className="h-4 w-4 text-amber-700" />
                  <p className="mt-1 text-[11px] font-medium text-foreground">Escalate</p>
                  <p className="text-[11px] text-muted-foreground leading-snug">Support reviews if the parties cannot agree.</p>
                </div>
              </div>

              {actionError && (
                <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 flex gap-2">
                  <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                  <span>{actionError}</span>
                </div>
              )}

              {ticket.resolution_error && (
                <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 flex gap-2">
                  <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                  <span>{ticket.resolution_error}</span>
                </div>
              )}

              {pendingOffer && (
                <div className="rounded-md border bg-background p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {getResolutionLabel(ticket.resolution_type)}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {ticket.resolution}
                      </p>
                      {ticket.resolution_amount && (
                        <p className="text-xs font-medium text-foreground mt-2">
                          Amount: {formatMoney(ticket.resolution_amount)}
                        </p>
                      )}
                    </div>
                    <CircleDollarSign className="h-5 w-5 text-green-700 flex-shrink-0" />
                  </div>
                  {canAcceptResolution && (
                    <div className="mt-3 flex gap-2">
                      <Button
                        size="sm"
                        className="rounded-md"
                        onClick={() => performResolutionAction("accept")}
                        disabled={actionLoading !== null}
                      >
                        {actionLoading === "accept" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                        Accept
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="rounded-md"
                        onClick={() => performResolutionAction("escalate")}
                        disabled={actionLoading !== null}
                      >
                        <Scale className="h-4 w-4" />
                        Escalate
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {canOfferResolution && (
                <div className="rounded-md border bg-background p-3 space-y-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">Offer a resolution</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      The buyer can accept it immediately or escalate to Yellow Jersey.
                    </p>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="resolution-type" className="text-xs">Outcome</Label>
                    <Select value={resolutionType} onValueChange={(value) => setResolutionType(value as ResolutionType)}>
                      <SelectTrigger id="resolution-type" className="w-full rounded-md">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {RESOLUTION_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {selectedOption?.helper && (
                      <p className="text-xs text-muted-foreground">{selectedOption.helper}</p>
                    )}
                  </div>
                  {resolutionType === "partial_refund" && (
                    <div className="grid gap-2">
                      <Label htmlFor="resolution-amount" className="text-xs">Refund amount</Label>
                      <Input
                        id="resolution-amount"
                        inputMode="decimal"
                        placeholder="0.00"
                        value={resolutionAmount}
                        onChange={(event) => setResolutionAmount(event.target.value)}
                        className="rounded-md"
                      />
                    </div>
                  )}
                  <div className="grid gap-2">
                    <Label htmlFor="resolution-message" className="text-xs">Message</Label>
                    <Textarea
                      id="resolution-message"
                      rows={3}
                      placeholder="Explain what you are offering and what happens next."
                      value={resolutionMessage}
                      onChange={(event) => setResolutionMessage(event.target.value)}
                      className="rounded-md resize-none"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      className="rounded-md"
                      onClick={() => performResolutionAction("propose", {
                        resolutionType,
                        amount: resolutionType === "partial_refund" ? resolutionAmount : null,
                        message: resolutionMessage,
                      })}
                      disabled={actionLoading !== null || (resolutionType === "partial_refund" && !resolutionAmount)}
                    >
                      {actionLoading === "propose" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Handshake className="h-4 w-4" />}
                      Send offer
                    </Button>
                    {canEscalate && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="rounded-md"
                        onClick={() => performResolutionAction("escalate")}
                        disabled={actionLoading !== null}
                      >
                        <Scale className="h-4 w-4" />
                        Escalate
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="flex border-b">
              <button
                onClick={() => setActiveTab("messages")}
                className={cn(
                  "flex-1 py-2.5 text-sm font-medium transition-colors",
                  activeTab === "messages"
                    ? "text-primary border-b-2 border-primary"
                    : "text-muted-foreground hover:text-foreground"
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
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                Timeline
              </button>
            </div>

            <div className="flex-1 overflow-y-auto">
              {activeTab === "messages" ? (
                <div className="p-4 space-y-4">
                  {messages.map((msg) => {
                    const isSupport = msg.sender_type === "support";
                    const isSeller = msg.sender_type === "seller";
                    const isOwnMessage = userRole === "admin"
                      ? isSupport
                      : msg.sender_type === userRole;
                    const senderName =
                      isOwnMessage
                        ? "You"
                        : msg.sender?.business_name ||
                          msg.sender?.name ||
                          (isSupport ? "Yellow Jersey Support" : isSeller ? "Seller" : "Buyer");

                    return (
                      <div
                        key={msg.id}
                        className={cn(
                          "flex gap-3",
                          isOwnMessage && "flex-row-reverse"
                        )}
                      >
                        <Avatar className="h-8 w-8 flex-shrink-0">
                          {msg.sender?.logo_url && (
                            <AvatarImage src={msg.sender.logo_url} />
                          )}
                          <AvatarFallback className={cn(
                            isSupport && "bg-muted text-muted-foreground"
                          )}>
                            {isSupport ? "YJ" : <User className="h-4 w-4" />}
                          </AvatarFallback>
                        </Avatar>
                        <div
                          className={cn(
                            "flex-1 max-w-[80%]",
                            isOwnMessage && "flex flex-col items-end"
                          )}
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs font-medium text-foreground">
                              {senderName}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {formatTime(msg.created_at)}
                            </span>
                          </div>
                          <div
                            className={cn(
                              "rounded-md px-3 py-2 text-sm whitespace-pre-wrap",
                              isOwnMessage
                                ? "bg-primary text-primary-foreground"
                                : "bg-muted text-foreground"
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
                              index === 0 ? "bg-primary" : "bg-muted-foreground/30"
                            )}
                          />
                          {index < history.length - 1 && (
                            <div className="w-px flex-1 bg-border my-1" />
                          )}
                        </div>
                        <div className="flex-1 pb-4">
                          <p className="text-xs font-medium text-foreground">
                            {getActionLabel(item.action)}
                          </p>
                          {typeof item.new_value?.status === "string" && item.new_value.status && (
                            <TicketStatusBadge
                              status={item.new_value.status}
                              className="mt-1"
                            />
                          )}
                          <p className="text-xs text-muted-foreground mt-1">
                            {formatDateTime(item.created_at)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {canReply && activeTab === "messages" && (
              <div className="border-t p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
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

            {ticket.status === "resolved" && (
              <div className="border-t p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
                <div className="flex items-center gap-2.5 mb-2">
                  <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0" />
                  <p className="text-xs font-medium text-foreground">This ticket has been resolved</p>
                </div>
                {ticket.resolution && (
                  <p className="text-xs text-muted-foreground">
                    Resolution: {ticket.resolution}
                  </p>
                )}
                {(ticket.stripe_refund_id || ticket.stripe_transfer_reversal_id) && (
                  <>
                    <Separator className="my-3" />
                    <div className="space-y-1 text-xs text-muted-foreground">
                      {ticket.stripe_refund_id && <p>Stripe refund: {ticket.stripe_refund_id}</p>}
                      {ticket.stripe_transfer_reversal_id && <p>Transfer reversal: {ticket.stripe_transfer_reversal_id}</p>}
                    </div>
                  </>
                )}
              </div>
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
