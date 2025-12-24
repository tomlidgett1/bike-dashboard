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
  SheetHeader,
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
} from 'lucide-react';
import { useOrderNotificationsContext } from '@/components/providers/order-notifications-provider';
import type { OrderNotification } from '@/lib/hooks/use-order-notifications';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import Image from 'next/image';

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
  };

  return displays[type] || { 
    icon: Bell, 
    title: type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()), 
    color: 'bg-gray-500' 
  };
}

// Get product image from notification
function getProductImage(notification: OrderNotification): string | null {
  const images = notification.purchase?.product?.images;
  if (!images || !Array.isArray(images) || images.length === 0) return null;
  
  const firstImage = images[0];
  if (typeof firstImage === 'string') return firstImage;
  if (firstImage?.cardUrl) return firstImage.cardUrl;
  if (firstImage?.url) return firstImage.url;
  
  return null;
}

// Get product name from notification
function getProductName(notification: OrderNotification): string {
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

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full text-left p-3 hover:bg-gray-50 transition-colors border-b border-gray-100 last:border-0 cursor-pointer',
        !notification.is_read && 'bg-amber-50/50'
      )}
    >
      <div className="flex items-start gap-3">
        {/* Product Image or Icon */}
        <div className="flex-shrink-0 relative">
          {productImage ? (
            <div className="w-12 h-12 rounded-md overflow-hidden bg-gray-100 relative">
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
              "w-12 h-12 rounded-md flex items-center justify-center",
              display.color
            )}>
              <Icon className="h-6 w-6 text-white" />
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900">
            {display.title}
          </p>
          <p className="text-sm text-gray-600 truncate mt-0.5">
            {notification.type === 'voucher_received' && notification.voucher
              ? notification.voucher.description
              : productName
            }
          </p>
          {notification.purchase?.order_number && (
            <p className="text-xs text-gray-500 mt-0.5">
              Order #{notification.purchase.order_number}
            </p>
          )}
          <p className="text-xs text-gray-400 mt-1">
            {formatDistanceToNow(new Date(notification.created_at), {
              addSuffix: true,
            })}
          </p>
        </div>

        {/* Unread Indicator */}
        {!notification.is_read && (
          <div className="flex-shrink-0 w-2.5 h-2.5 rounded-full bg-amber-500 mt-1" />
        )}
      </div>
    </button>
  );
}

export function NotificationsDropdown() {
  const router = useRouter();
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
    router.push('/settings/purchases');
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
  const NotificationContent = () => (
    <>
      {notifications.length === 0 ? (
        <div className="p-8 text-center text-gray-500">
          <Bell className="h-12 w-12 mx-auto mb-3 text-gray-300" />
          <p className="font-medium text-gray-900">No notifications yet</p>
          <p className="text-sm text-gray-500 mt-1">
            You&apos;ll be notified about order updates here
          </p>
        </div>
      ) : (
        <div>
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
          <SheetContent side="bottom" className="h-[80vh] rounded-t-2xl p-0 gap-0" showCloseButton={false}>
            {/* Header */}
            <div className="sticky top-0 bg-white border-b border-gray-200 px-4 py-3 rounded-t-2xl">
              <div className="flex items-center justify-between">
                <SheetTitle className="text-lg font-semibold">Notifications</SheetTitle>
                <div className="flex items-center gap-3">
                  {unreadCount > 0 && (
                    <button 
                      onClick={handleMarkAllRead}
                      className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                    >
                      Mark all read
                    </button>
                  )}
                  <button
                    onClick={() => setMobileSheetOpen(false)}
                    className="h-8 w-8 rounded-full hover:bg-gray-100 flex items-center justify-center"
                  >
                    <X className="h-5 w-5 text-gray-500" />
                  </button>
                </div>
              </div>
              {unreadCount > 0 && (
                <p className="text-sm text-gray-500 mt-1">{unreadCount} unread</p>
              )}
            </div>

            {/* Notifications List */}
            <div className="flex-1 overflow-y-auto">
              <NotificationContent />
            </div>

            {/* Footer */}
            <div className="sticky bottom-0 bg-white border-t border-gray-200 p-4 safe-area-bottom">
              <Button
                onClick={handleViewAll}
                className="w-full rounded-md"
              >
                View All Orders
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
          className="relative h-9 w-9 rounded-full border border-gray-300 hover:bg-gray-100 transition-colors cursor-pointer flex items-center justify-center"
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
      <DropdownMenuContent align="end" className="w-96">
        <DropdownMenuLabel className="font-normal">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold">Notifications</span>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <>
                  <span className="text-xs text-gray-600">
                    {unreadCount} unread
                  </span>
                  <button 
                    onClick={handleMarkAllRead}
                    className="text-xs text-blue-600 hover:text-blue-800 font-medium cursor-pointer"
                  >
                    Mark all read
                  </button>
                </>
              )}
            </div>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        {/* Notifications List */}
        <div className="max-h-[400px] overflow-y-auto">
          <NotificationContent />
        </div>

        <DropdownMenuSeparator />

        {/* View All Button */}
        <div className="p-2">
          <Button
            variant="ghost"
            className="w-full rounded-md text-sm cursor-pointer"
            onClick={handleViewAll}
          >
            View All Orders
          </Button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

