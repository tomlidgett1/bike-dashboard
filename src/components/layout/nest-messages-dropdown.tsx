"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { MessageSquare } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useNestNotificationsContext } from "@/components/providers/nest-notifications-provider";
import { topbarIconButtonClass } from "@/components/layout/topbar-nav-pills";
import { isNestConversationUnread } from "@/lib/nest/conversation-read-state";
import {
  StoreHeaderDropdownBody,
  StoreHeaderDropdownEmpty,
  StoreHeaderDropdownFooter,
  StoreHeaderDropdownFooterAction,
  StoreHeaderDropdownHeader,
  StoreHeaderDropdownItem,
  storeHeaderDropdownContentClass,
} from "@/components/layout/store-header-dropdown-panel";

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
          className={topbarIconButtonClass}
          aria-label="Nest messages"
        >
          <MessageSquare className="size-4" />
          {unreadCount > 0 ? (
            <span className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-xs font-medium text-white">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          ) : null}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={8}
        className={storeHeaderDropdownContentClass}
      >
        <StoreHeaderDropdownHeader
          title="Nest messages"
          actions={
            unreadCount > 0 ? (
              <button
                type="button"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  markAllRead();
                }}
                className="text-xs font-medium text-gray-500 transition hover:text-gray-800"
              >
                Mark all read
              </button>
            ) : null
          }
          subtitle={
            unreadCount > 0 ? (
              <p className="mt-1 text-xs text-gray-500">{unreadCount} unread</p>
            ) : null
          }
        />

        <StoreHeaderDropdownBody>
          {dropdownItems.length === 0 ? (
            <StoreHeaderDropdownEmpty icon={MessageSquare} message="No new Nest messages" />
          ) : (
            dropdownItems.map((notification) => (
              <StoreHeaderDropdownItem
                key={notification.id}
                onClick={() => handleNotificationClick(notification.chatId)}
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-medium text-gray-700">
                    {notification.displayName.slice(0, 1).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-gray-800">
                      {notification.displayName}
                    </p>
                    <p className="mt-0.5 line-clamp-2 text-xs text-gray-500">
                      {notification.preview}
                    </p>
                    <p className="mt-1 text-xs text-gray-400">
                      {formatDistanceToNow(new Date(notification.receivedAt), { addSuffix: true })}
                    </p>
                  </div>
                  <div className="mt-1 h-2 w-2 shrink-0 rounded-full bg-gray-800" />
                </div>
              </StoreHeaderDropdownItem>
            ))
          )}
        </StoreHeaderDropdownBody>

        <StoreHeaderDropdownFooter>
          <StoreHeaderDropdownFooterAction onClick={handleViewAll}>
            Open Nest inbox
          </StoreHeaderDropdownFooterAction>
        </StoreHeaderDropdownFooter>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
