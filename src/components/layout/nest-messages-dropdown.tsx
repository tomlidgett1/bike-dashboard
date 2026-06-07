"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useNestNotificationsContext } from "@/components/providers/nest-notifications-provider";
import { isNestConversationUnread } from "@/lib/nest/conversation-read-state";
import { cn } from "@/lib/utils";

export function NestMessagesDropdown() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const {
    configured,
    chats,
    notifications,
    unreadCount,
    markNotificationRead,
    markAllRead,
    refresh,
  } = useNestNotificationsContext();

  if (!configured) return null;

  const unreadChats = chats.filter(isNestConversationUnread).slice(0, 10);
  const dropdownItems =
    notifications.length > 0
      ? notifications.map((notification) => ({
          id: notification.id,
          chatId: notification.chatId,
          displayName: notification.displayName,
          preview: notification.preview,
          receivedAt: notification.receivedAt,
        }))
      : unreadChats.map((chat) => ({
          id: chat.chatId,
          chatId: chat.chatId,
          displayName: chat.displayName || chat.title || chat.participantHandle || chat.chatId,
          preview: chat.preview || "Unread message",
          receivedAt: chat.lastCustomerMessageAt || chat.lastMessageAt,
        }));

  const handleOpenChange = (isOpen: boolean) => {
    setOpen(isOpen);
    if (isOpen) refresh();
  };

  const handleNotificationClick = (chatId: string) => {
    markNotificationRead(chatId);
    setOpen(false);
    router.push(`/settings/store/nest?chatId=${encodeURIComponent(chatId)}`);
  };

  const handleViewAll = () => {
    setOpen(false);
    router.push("/settings/store/nest");
  };

  return (
    <DropdownMenu open={open} onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger asChild>
        <button
          className="relative flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground cursor-pointer"
          aria-label="Nest messages"
        >
          <MessageSquare className="size-4 stroke-[1.75]" />
          {unreadCount > 0 ? (
            <span className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-xs font-medium text-white">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          ) : null}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[calc(100vw-2rem)] max-w-96">
        <DropdownMenuLabel className="font-normal">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-semibold">Nest messages</span>
            {unreadCount > 0 ? (
              <button
                type="button"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  markAllRead();
                }}
                className="text-xs font-medium text-primary hover:text-primary/80"
              >
                Mark all read
              </button>
            ) : null}
          </div>
          {unreadCount > 0 ? (
            <p className="mt-1 text-xs text-muted-foreground">{unreadCount} unread</p>
          ) : null}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        <div className="max-h-[50vh] sm:max-h-[400px] overflow-y-auto">
          {dropdownItems.length === 0 ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              <MessageSquare className="mx-auto mb-2 h-7 w-7 text-muted-foreground/60" />
              <p>No new Nest messages</p>
            </div>
          ) : (
            <div className="space-y-1">
              {dropdownItems.map((notification) => (
                <button
                  key={notification.id}
                  type="button"
                  onClick={() => handleNotificationClick(notification.chatId)}
                  className={cn(
                    "w-full border-b border-gray-100 p-3 text-left transition-colors last:border-0 hover:bg-gray-50",
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-medium text-gray-700">
                      {notification.displayName.slice(0, 1).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">
                        {notification.displayName}
                      </p>
                      <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                        {notification.preview}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground/80">
                        {formatDistanceToNow(new Date(notification.receivedAt), { addSuffix: true })}
                      </p>
                    </div>
                    <div className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary" />
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <DropdownMenuSeparator />

        <div className="p-2">
          <Button variant="ghost" className="w-full rounded-md" onClick={handleViewAll}>
            Open Nest inbox
          </Button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
