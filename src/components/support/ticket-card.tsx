"use client";

import * as React from "react";
import Image from "next/image";
import { ChevronRight, Package, MessageCircle, Clock } from "lucide-react";
import { TicketStatusBadge } from "./ticket-status-badge";
import { cn } from "@/lib/utils";

// ============================================================
// Types
// ============================================================

export interface TicketCardProps {
  ticket: {
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
    product?: {
      display_name?: string;
      description?: string;
      primary_image_url?: string;
      cached_image_url?: string;
    };
  };
  onClick: () => void;
}

// ============================================================
// Helper Functions
// ============================================================

function getCategoryLabel(category: string): string {
  const labels: Record<string, string> = {
    item_not_received: "Not Received",
    item_not_as_described: "Not as Described",
    damaged: "Damaged",
    wrong_item: "Wrong Item",
    refund_request: "Refund",
    shipping_issue: "Shipping",
    general_question: "Question",
  };
  return labels[category] || category;
}

function getProductImage(product?: TicketCardProps["ticket"]["product"]): string | null {
  if (!product) return null;
  if (product.cached_image_url) return product.cached_image_url;
  if (product.primary_image_url) return product.primary_image_url;
  return null;
}

function getProductName(product?: TicketCardProps["ticket"]["product"]): string {
  if (!product) return "Product";
  return product.display_name || product.description || "Product";
}

function formatDate(date: string): string {
  return new Date(date).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
  });
}

function getTimeAgo(date: string): string {
  const now = new Date();
  const then = new Date(date);
  const diffMs = now.getTime() - then.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return formatDate(date);
}

// ============================================================
// Component
// ============================================================

export function TicketCard({ ticket, onClick }: TicketCardProps) {
  const product = ticket.product || ticket.purchase?.product;
  const productImage = getProductImage(product);
  const productName = getProductName(product);

  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-white rounded-md border border-gray-200 p-4 active:bg-gray-50 transition-colors hover:border-gray-300"
    >
      <div className="flex gap-3">
        {/* Product Image */}
        <div className="relative h-14 w-14 rounded-md overflow-hidden bg-gray-100 flex-shrink-0">
          {productImage ? (
            <Image
              src={productImage}
              alt={productName}
              fill
              className="object-cover"
              sizes="56px"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <Package className="h-6 w-6 text-gray-400" />
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-medium text-gray-900 text-sm line-clamp-1">
                {ticket.subject}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                {ticket.ticket_number} · {getCategoryLabel(ticket.category)}
              </p>
            </div>
            <TicketStatusBadge status={ticket.status} className="flex-shrink-0" />
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between mt-2">
            <div className="flex items-center gap-3 text-xs text-gray-500">
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {getTimeAgo(ticket.updated_at)}
              </span>
              {(ticket.messageCount || 0) > 0 && (
                <span className="flex items-center gap-1">
                  <MessageCircle className="h-3 w-3" />
                  {ticket.messageCount}
                </span>
              )}
            </div>
          </div>
        </div>

        <ChevronRight className="h-5 w-5 text-gray-400 self-center flex-shrink-0" />
      </div>
    </button>
  );
}

// ============================================================
// Mobile Ticket Card (Compact)
// ============================================================

export function MobileTicketCard({ ticket, onClick }: TicketCardProps) {
  const product = ticket.product || ticket.purchase?.product;
  const productImage = getProductImage(product);
  const productName = getProductName(product);

  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-white rounded-md border border-gray-200 p-3 active:bg-gray-50 transition-colors"
    >
      <div className="flex gap-3">
        {/* Product Image */}
        <div className="relative h-12 w-12 rounded-md overflow-hidden bg-gray-100 flex-shrink-0">
          {productImage ? (
            <Image
              src={productImage}
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

        {/* Content */}
        <div className="flex-1 min-w-0">
          <p className="font-medium text-gray-900 text-sm line-clamp-1">
            {productName}
          </p>
          <p className="text-xs text-gray-500 mt-0.5">
            {getCategoryLabel(ticket.category)} · {getTimeAgo(ticket.updated_at)}
          </p>
          <div className="mt-1.5">
            <TicketStatusBadge status={ticket.status} />
          </div>
        </div>

        <ChevronRight className="h-5 w-5 text-gray-400 self-center flex-shrink-0" />
      </div>
    </button>
  );
}

