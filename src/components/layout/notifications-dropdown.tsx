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
  Package, 
  Truck, 
  CheckCircle2, 
  DollarSign, 
  AlertTriangle,
  MapPin,
  ShoppingBag,
  CreditCard,
  X,
  Gift,
  LifeBuoy,
  MessageCircle,
  Handshake,
  RefreshCw,
  Scale,
} from 'lucide-react';
import { useOrderNotificationsContext } from '@/components/providers/order-notifications-provider';
import { useMessages } from '@/components/providers/messages-provider';
import type { OrderNotification } from '@/lib/hooks/use-order-notifications';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import Image from 'next/image';

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
      icon: ShoppingBag, 
      title: 'New Order Received', 
      color: 'bg-green-500' 
    },
    order_confirmed: { 
      icon: CreditCard, 
      title: 'Payment Confirmed', 
      color: 'bg-green-500' 
    },
    tracking_added: { 
      icon: MapPin, 
      title: 'Tracking Number Added', 
      color: 'bg-blue-500' 
    },
    order_shipped: { 
      icon: Truck, 
      title: 'Order Shipped', 
      color: 'bg-blue-500' 
    },
    order_delivered: { 
      icon: Package, 
      title: 'Order Delivered', 
      color: 'bg-green-600' 
    },
    receipt_confirmed: { 
      icon: CheckCircle2, 
      title: 'Receipt Confirmed', 
      color: 'bg-green-600' 
    },
    funds_released: { 
      icon: DollarSign, 
      title: 'Funds Released', 
      color: 'bg-green-600' 
    },
    issue_reported: { 
      icon: AlertTriangle, 
      title: 'Issue Reported', 
      color: 'bg-red-500' 
    },
    voucher_received: {
      icon: Gift,
      title: 'You earned a $10 voucher!',
      color: 'bg-green-500'
    },
    ticket_created: {
      icon: LifeBuoy,
      title: 'New Claim Opened',
      color: 'bg-amber-500'
    },
    ticket_message: {
      icon: MessageCircle,
      title: 'New Claim Message',
      color: 'bg-blue-500'
    },
    ticket_status_changed: {
      icon: LifeBuoy,
      title: 'Claim Updated',
      color: 'bg-blue-500'
    },
    ticket_resolution_offered: {
      icon: Handshake,
      title: 'Resolution Offered',
      color: 'bg-green-600'
    },
    ticket_resolution_accepted: {
      icon: CheckCircle2,
      title: 'Resolution Accepted',
      color: 'bg-green-600'
    },
    ticket_refunded: {
      icon: RefreshCw,
      title: 'Refund Processed',
      color: 'bg-green-600'
    },
    ticket_released_to_seller: {
      icon: DollarSign,
      title: 'Payment Released',
      color: 'bg-green-600'
    },
    ticket_resolved: {
      icon: CheckCircle2,
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
  onClick 
}: { 
  notification: OrderNotification; 
  onClick: () => void;
}) {
  const display = getNotificationDisplay(notification.type);
  const Icon = display.icon;
  const productImage = getProductImage(notification);
  const productName = getProductName(notification);
  const orderNumber = notification.purchase?.order_number || notification.ticket?.purchase?.order_number;

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full rounded-xl p-2.5 text-left transition-colors cursor-pointer outline-none',
        'hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring/30',
        !notification.is_read && 'bg-muted/50'
      )}
    >
      <div className="flex items-start gap-3">
        {/* Product Image or Icon */}
        <div className="flex-shrink-0 relative">
          {productImage ? (
            <div className="w-12 h-12 rounded-xl overflow-hidden bg-muted relative ring-1 ring-border/50">
              <Image 
                src={productImage} 
                alt={productName} 
                fill 
                className="object-cover" 
                sizes="48px"
              />
              {/* Icon badge */}
              <div className={cn(
                "absolute -bottom-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center",
                display.color
              )}>
                <Icon className="h-2.5 w-2.5 text-white" />
              </div>
            </div>
          ) : (
            <div className={cn(
              "w-12 h-12 rounded-xl flex items-center justify-center bg-muted ring-1 ring-border/50"
            )}>
              <Icon className="h-5 w-5 text-muted-foreground" />
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground">
            {display.title}
          </p>
          <p className="text-sm text-muted-foreground truncate mt-0.5">
            {notification.type === 'voucher_received' && notification.voucher
              ? notification.voucher.description
              : productName
            }
          </p>
          {orderNumber && (
            <p className="text-xs text-muted-foreground mt-0.5">
              Order #{orderNumber}
            </p>
          )}
          <p className="text-xs text-muted-foreground/70 mt-1">
            {formatDistanceToNow(new Date(notification.created_at), {
              addSuffix: true,
            })}
          </p>
        </div>

        {/* Unread Indicator */}
        {!notification.is_read && (
          <div className="flex-shrink-0 w-2 h-2 rounded-full bg-primary mt-1.5" />
        )}
      </div>
    </button>
  );
}

export function NotificationsDropdown() {
  const router = useRouter();
  const { openConversation } = useMessages();
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
  const renderNotificationContent = () => (
    <>
      {notifications.length === 0 ? (
        <div className="px-8 py-10 text-center text-muted-foreground">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-muted">
            <Bell className="h-5 w-5" />
          </div>
          <p className="font-medium text-foreground">No notifications yet</p>
          <p className="text-sm text-muted-foreground mt-1">
            You&apos;ll be notified about order and claim updates here
          </p>
        </div>
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

  // Mobile: Use Sheet
  if (isMobile) {
    return (
      <>
        <button
          onClick={handleBellClick}
          className="relative h-9 w-9 rounded-full hover:bg-gray-100 transition-colors cursor-pointer flex items-center justify-center"
          aria-label="Notifications"
        >
          <Bell className="h-[22px] w-[22px] text-gray-700 stroke-[2]" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-red-500 text-white text-xs flex items-center justify-center font-medium">
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
                    <X className="h-5 w-5 text-muted-foreground" />
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
          className="relative h-9 w-9 rounded-full hover:bg-gray-100 transition-colors cursor-pointer flex items-center justify-center"
          aria-label="Notifications"
        >
          <Bell className="h-[18px] w-[18px] text-gray-700 stroke-[2]" />
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
        className="w-96 overflow-hidden rounded-2xl border border-border/50 bg-popover p-0 text-popover-foreground shadow-2xl shadow-black/15 ring-0"
      >
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
                    className="text-xs text-primary hover:text-primary/80 font-medium cursor-pointer"
                  >
                    Mark all read
                  </button>
                </>
              )}
            </div>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="mx-0 my-0 bg-border/60" />

        {/* Notifications List */}
        <div className="max-h-[400px] overflow-y-auto bg-popover">
          {renderNotificationContent()}
        </div>

        <DropdownMenuSeparator className="mx-0 my-0 bg-border/60" />

        {/* View All Button */}
        <div className="p-2">
          <Button
            variant="ghost"
            className="w-full rounded-lg text-sm cursor-pointer"
            onClick={handleViewAll}
          >
            View All
          </Button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
