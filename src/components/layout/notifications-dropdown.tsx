// ============================================================
// ORDER NOTIFICATIONS DROPDOWN COMPONENT
// ============================================================
// Header dropdown for viewing order-related notifications
// Uses Sheet on mobile for better UX, Dropdown on desktop

'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Sheet,
  SheetContent,
  SheetTitle,
} from '@/components/ui/sheet';
import { 
  Bell, 
  Box, 
  Delivery, 
  CheckCircle, 
  Dollar, 
  DangerTriangle,
  MapPoint,
  Bag,
  Card,
  CloseCircle,
  Gift,
  Help,
  ChatRound,
  HandShake,
  Refresh,
  Scale,
} from '@/components/layout/app-sidebar/sidebar-icons';
import { useOrderNotificationsContext } from '@/components/providers/order-notifications-provider';
import { useMessages } from '@/components/providers/messages-provider';
import type { OrderNotification } from '@/lib/hooks/use-order-notifications';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import { topbarIconButtonClass } from '@/components/layout/topbar-nav-pills';
import Image from 'next/image';
import {
  StoreHeaderDropdownBody,
  StoreHeaderDropdownEmpty,
  StoreHeaderDropdownFooter,
  StoreHeaderDropdownFooterAction,
  StoreHeaderDropdownHeader,
  StoreHeaderDropdownItem,
  storeHeaderDropdownContentClass,
  useStoreHeaderDropdownStyle,
} from '@/components/layout/store-header-dropdown-panel';

type LegacyProductImage = {
  thumbnailUrl?: string | null;
  thumbnail_url?: string | null;
  cardUrl?: string | null;
  card_url?: string | null;
  url?: string | null;
};

function isLegacyProductImage(value: unknown): value is LegacyProductImage {
  return !!value && typeof value === 'object';
}

// Get notification display info based on type
function getNotificationDisplay(type: string): { 
  icon: React.ComponentType<{ className?: string }>; 
  title: string; 
  color: string;
} {
  const displays: Record<string, { icon: React.ComponentType<{ className?: string }>; title: string; color: string }> = {
    order_placed: { 
      icon: Bag, 
      title: 'New Order Received', 
      color: 'bg-green-500' 
    },
    order_confirmed: { 
      icon: Card, 
      title: 'Payment Confirmed', 
      color: 'bg-green-500' 
    },
    tracking_added: { 
      icon: MapPoint, 
      title: 'Tracking Number Added', 
      color: 'bg-blue-500' 
    },
    order_shipped: { 
      icon: Delivery, 
      title: 'Order Shipped', 
      color: 'bg-blue-500' 
    },
    order_delivered: { 
      icon: Box, 
      title: 'Order Delivered', 
      color: 'bg-green-600' 
    },
    receipt_confirmed: { 
      icon: CheckCircle, 
      title: 'Receipt Confirmed', 
      color: 'bg-green-600' 
    },
    funds_released: { 
      icon: Dollar, 
      title: 'Funds Released', 
      color: 'bg-green-600' 
    },
    issue_reported: { 
      icon: DangerTriangle, 
      title: 'Issue Reported', 
      color: 'bg-red-500' 
    },
    voucher_received: {
      icon: Gift,
      title: 'You earned a $10 voucher!',
      color: 'bg-green-500'
    },
    ticket_created: {
      icon: Help,
      title: 'New Claim Opened',
      color: 'bg-amber-500'
    },
    ticket_message: {
      icon: ChatRound,
      title: 'New Claim Message',
      color: 'bg-blue-500'
    },
    ticket_status_changed: {
      icon: Help,
      title: 'Claim Updated',
      color: 'bg-blue-500'
    },
    ticket_resolution_offered: {
      icon: HandShake,
      title: 'Resolution Offered',
      color: 'bg-green-600'
    },
    ticket_resolution_accepted: {
      icon: CheckCircle,
      title: 'Resolution Accepted',
      color: 'bg-green-600'
    },
    ticket_refunded: {
      icon: Refresh,
      title: 'Refund Processed',
      color: 'bg-green-600'
    },
    ticket_released_to_seller: {
      icon: Dollar,
      title: 'Payment Released',
      color: 'bg-green-600'
    },
    ticket_resolved: {
      icon: CheckCircle,
      title: 'Claim Resolved',
      color: 'bg-green-600'
    },
    ticket_escalated: {
      icon: Scale,
      title: 'Claim Escalated',
      color: 'bg-red-500'
    },
  };

  return displays[type] || { 
    icon: Bell, 
    title: type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()), 
    color: 'bg-gray-500' 
  };
}

// Get product image from notification
function getProductImage(notification: OrderNotification): string | null {
  const product = (notification.purchase || notification.ticket?.purchase)?.product;
  if (!product) return null;

  if (product.thumbnail_url) return product.thumbnail_url;
  if (product.cached_image_url) return product.cached_image_url;
  if (product.primary_image_url) return product.primary_image_url;

  const images = product.images;
  if (!images || !Array.isArray(images) || images.length === 0) return null;
  
  const firstImage = images[0];
  if (typeof firstImage === 'string') return firstImage;
  if (!isLegacyProductImage(firstImage)) return null;
  if (firstImage?.thumbnailUrl) return firstImage.thumbnailUrl;
  if (firstImage?.thumbnail_url) return firstImage.thumbnail_url;
  if (firstImage?.cardUrl) return firstImage.cardUrl;
  if (firstImage?.card_url) return firstImage.card_url;
  if (firstImage?.url) return firstImage.url;
  
  return null;
}

// Get product name from notification
function getProductName(notification: OrderNotification): string {
  if (notification.notification_category === 'support') {
    return notification.ticket?.subject || 'Support claim';
  }

  const product = notification.purchase?.product;
  if (!product) return 'Unknown Product';
  return product.display_name || product.description || 'Unknown Product';
}

// Shared notification item component
function NotificationItem({ 
  notification, 
  onClick,
  useStoreStyle = false,
}: { 
  notification: OrderNotification; 
  onClick: () => void;
  useStoreStyle?: boolean;
}) {
  const display = getNotificationDisplay(notification.type);
  const Icon = display.icon;
  const productImage = getProductImage(notification);
  const productName = getProductName(notification);
  const orderNumber = notification.purchase?.order_number || notification.ticket?.purchase?.order_number;

  const content = (
    <div className="flex items-start gap-3">
      <div className="relative shrink-0">
        {productImage ? (
          <div
            className={cn(
              'relative h-12 w-12 overflow-hidden rounded-md bg-gray-100',
              useStoreStyle ? 'ring-1 ring-gray-200' : 'bg-muted ring-1 ring-border/50',
            )}
          >
            <Image
              src={productImage}
              alt={productName}
              fill
              className="object-cover"
              sizes="48px"
            />
            <div
              className={cn(
                'absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full',
                display.color,
              )}
            >
              <Icon className="h-2.5 w-2.5 text-white" />
            </div>
          </div>
        ) : (
          <div
            className={cn(
              'flex h-12 w-12 items-center justify-center rounded-md',
              useStoreStyle
                ? 'bg-gray-100 ring-1 ring-gray-200'
                : 'bg-muted ring-1 ring-border/50',
            )}
          >
            <Icon
              className={cn(
                'h-5 w-5',
                useStoreStyle ? 'text-gray-500' : 'text-muted-foreground',
              )}
            />
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p
          className={cn(
            'text-sm font-medium',
            useStoreStyle ? 'text-gray-800' : 'text-foreground',
          )}
        >
          {display.title}
        </p>
        <p
          className={cn(
            'mt-0.5 truncate text-sm',
            useStoreStyle ? 'text-gray-500' : 'text-muted-foreground',
          )}
        >
          {notification.type === 'voucher_received' && notification.voucher
            ? notification.voucher.description
            : productName}
        </p>
        {orderNumber ? (
          <p
            className={cn(
              'mt-0.5 text-xs',
              useStoreStyle ? 'text-gray-500' : 'text-muted-foreground',
            )}
          >
            Order #{orderNumber}
          </p>
        ) : null}
        <p
          className={cn(
            'mt-1 text-xs',
            useStoreStyle ? 'text-gray-400' : 'text-muted-foreground/70',
          )}
        >
          {formatDistanceToNow(new Date(notification.created_at), {
            addSuffix: true,
          })}
        </p>
      </div>

      {!notification.is_read ? (
        <div
          className={cn(
            'mt-1.5 h-2 w-2 shrink-0 rounded-full',
            useStoreStyle ? 'bg-gray-800' : 'bg-primary',
          )}
        />
      ) : null}
    </div>
  );

  if (useStoreStyle) {
    return (
      <StoreHeaderDropdownItem
        onClick={onClick}
        className={cn(!notification.is_read && 'bg-gray-50')}
      >
        {content}
      </StoreHeaderDropdownItem>
    );
  }

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full cursor-pointer rounded-xl p-2.5 text-left outline-none transition-colors',
        'hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring/30',
        !notification.is_read && 'bg-muted/50',
      )}
    >
      {content}
    </button>
  );
}

export function NotificationsDropdown({ plainMobile = false }: { plainMobile?: boolean } = {}) {
  const router = useRouter();
  const { openConversation } = useMessages();
  const useStoreStyle = useStoreHeaderDropdownStyle();
  const [mobileSheetOpen, setMobileSheetOpen] = React.useState(false);
  const [isMobile, setIsMobile] = React.useState(false);
  
  // Use context instead of hook directly - this prevents duplicate fetches
  // when multiple NotificationsDropdown instances are rendered (mobile + desktop)
  const { 
    notifications, 
    unreadCount, 
    markAsRead, 
    markAllAsRead, 
    refresh 
  } = useOrderNotificationsContext();

  // Detect mobile
  React.useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 640);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const handleNotificationClick = async (notification: OrderNotification) => {
    if (!notification.is_read) {
      await markAsRead(notification.id);
    }
    setMobileSheetOpen(false);
    if (notification.notification_category === 'support' && notification.ticket_id) {
      openConversation(`ticket:${notification.ticket_id}`);
    } else {
      router.push('/settings/purchases');
    }
    refresh();
  };

  const handleViewAll = () => {
    setMobileSheetOpen(false);
    router.push('/settings/purchases');
  };

  const handleMarkAllRead = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    await markAllAsRead();
  };

  const handleBellClick = () => {
    if (isMobile) {
      setMobileSheetOpen(true);
    }
  };

  // Notification content - shared between dropdown and sheet
  const renderNotificationContent = (storePanel = false) => (
    <>
      {notifications.length === 0 ? (
        storePanel ? (
          <StoreHeaderDropdownEmpty icon={Bell} message="No notifications yet" />
        ) : (
          <div className="px-8 py-10 text-center text-muted-foreground">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-muted">
              <Bell className="h-5 w-5" />
            </div>
            <p className="font-medium text-foreground">No notifications yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              You&apos;ll be notified about order and claim updates here
            </p>
          </div>
        )
      ) : storePanel ? (
        notifications.map((notification) => (
          <NotificationItem
            key={notification.id}
            notification={notification}
            onClick={() => handleNotificationClick(notification)}
            useStoreStyle
          />
        ))
      ) : (
        <div className="space-y-1 p-1.5">
          {notifications.map((notification) => (
            <NotificationItem
              key={notification.id}
              notification={notification}
              onClick={() => handleNotificationClick(notification)}
            />
          ))}
        </div>
      )}
    </>
  );

  const mobileTriggerClass = plainMobile
    ? 'relative h-9 w-9 rounded-md hover:bg-gray-100 transition-colors flex items-center justify-center overflow-visible'
    : topbarIconButtonClass;

  const mobileBellClass = plainMobile
    ? 'h-[22px] w-[22px] text-gray-700 stroke-[2]'
    : 'size-4';

  const mobileBadgeClass = plainMobile
    ? 'absolute -top-1.5 -right-1.5 h-5 min-w-[20px] px-1 rounded-full bg-red-500 text-white text-[11px] flex items-center justify-center font-bold shadow-sm z-10'
    : 'absolute -top-1 -right-1 h-5 w-5 rounded-full bg-red-500 text-white text-xs flex items-center justify-center font-medium';

  // Mobile: Use Sheet
  if (isMobile) {
    return (
      <>
        <button
          onClick={handleBellClick}
          className={mobileTriggerClass}
          aria-label="Notifications"
        >
          <Bell className={mobileBellClass} />
          {unreadCount > 0 && (
            <span className={mobileBadgeClass}>
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </button>

        <Sheet open={mobileSheetOpen} onOpenChange={setMobileSheetOpen}>
          <SheetContent side="bottom" className="data-[side=bottom]:h-[85dvh] overflow-hidden rounded-t-2xl p-0 gap-0" showCloseButton={false}>
            {/* Header */}
            <div className="sticky top-0 bg-popover border-b border-border/60 px-4 py-3 rounded-t-2xl">
              <div className="flex items-center justify-between">
                <SheetTitle className="text-lg font-semibold">Notifications</SheetTitle>
                <div className="flex items-center gap-3">
                  {unreadCount > 0 && (
                    <button 
                      onClick={handleMarkAllRead}
                      className="text-sm text-primary hover:text-primary/80 font-medium"
                    >
                      Mark all read
                    </button>
                  )}
                  <button
                    onClick={() => setMobileSheetOpen(false)}
                    className="h-8 w-8 rounded-full hover:bg-muted flex items-center justify-center"
                  >
                    <CloseCircle className="h-5 w-5 text-muted-foreground" />
                  </button>
                </div>
              </div>
              {unreadCount > 0 && (
                <p className="text-sm text-muted-foreground mt-1">{unreadCount} unread</p>
              )}
            </div>

            {/* Notifications List */}
            <div className="flex-1 overflow-y-auto">
              {renderNotificationContent()}
            </div>

            {/* Footer */}
            <div className="sticky bottom-0 bg-popover border-t border-border/60 p-4 safe-area-bottom">
              <Button
                onClick={handleViewAll}
                className="w-full rounded-md"
              >
                View All
              </Button>
            </div>
          </SheetContent>
        </Sheet>
      </>
    );
  }

  // Desktop: Use Dropdown
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button
          className={topbarIconButtonClass}
          aria-label="Notifications"
        >
          <Bell className="size-4" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-red-500 text-white text-xs flex items-center justify-center font-medium">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={8}
        className={cn(
          useStoreStyle
            ? storeHeaderDropdownContentClass
            : 'w-96 overflow-hidden rounded-2xl border border-border/50 bg-popover p-0 text-popover-foreground shadow-2xl shadow-black/15 ring-0',
        )}
      >
        {useStoreStyle ? (
          <StoreHeaderDropdownHeader
            title="Notifications"
            actions={
              unreadCount > 0 ? (
                <button
                  type="button"
                  onClick={handleMarkAllRead}
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
        ) : (
          <>
            <DropdownMenuLabel className="px-4 py-3 font-normal">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-foreground">Notifications</span>
                <div className="flex items-center gap-2">
                  {unreadCount > 0 && (
                    <>
                      <span className="text-xs text-muted-foreground">
                        {unreadCount} unread
                      </span>
                      <button
                        onClick={handleMarkAllRead}
                        className="cursor-pointer text-xs font-medium text-primary hover:text-primary/80"
                      >
                        Mark all read
                      </button>
                    </>
                  )}
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator className="mx-0 my-0 bg-border/60" />
          </>
        )}

        {useStoreStyle ? (
          <StoreHeaderDropdownBody className="sm:max-h-[400px]">
            {renderNotificationContent(true)}
          </StoreHeaderDropdownBody>
        ) : (
          <div className="max-h-[400px] overflow-y-auto bg-popover">
            {renderNotificationContent()}
          </div>
        )}

        {useStoreStyle ? (
          <StoreHeaderDropdownFooter>
            <StoreHeaderDropdownFooterAction onClick={handleViewAll}>
              View All
            </StoreHeaderDropdownFooterAction>
          </StoreHeaderDropdownFooter>
        ) : (
          <>
            <DropdownMenuSeparator className="mx-0 my-0 bg-border/60" />
            <div className="p-2">
              <Button
                variant="ghost"
                className="w-full cursor-pointer rounded-lg text-sm"
                onClick={handleViewAll}
              >
                View All
              </Button>
            </div>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
