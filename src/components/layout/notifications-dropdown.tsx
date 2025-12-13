// ============================================================
// ORDER NOTIFICATIONS DROPDOWN COMPONENT
// ============================================================
// Header dropdown for viewing order-related notifications

'use client';

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
  Bell, 
  Package, 
  Truck, 
  CheckCircle2, 
  DollarSign, 
  AlertTriangle,
  MapPin,
  ShoppingBag,
  CreditCard,
} from 'lucide-react';
import { useOrderNotifications, type OrderNotification } from '@/lib/hooks/use-order-notifications';
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

export function NotificationsDropdown() {
  const router = useRouter();
  const { 
    notifications, 
    unreadCount, 
    markAsRead, 
    markAllAsRead, 
    refresh 
  } = useOrderNotifications(10, false);

  const handleNotificationClick = async (notification: OrderNotification) => {
    if (!notification.is_read) {
      await markAsRead(notification.id);
    }
    // Navigate to order details
    router.push('/settings/purchases');
    refresh();
  };

  const handleViewAll = () => {
    router.push('/settings/purchases');
  };

  const handleMarkAllRead = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    await markAllAsRead();
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative rounded-full"
          aria-label="Notifications"
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-red-500 text-white text-xs flex items-center justify-center font-medium">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[calc(100vw-2rem)] max-w-96">
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
        <div className="max-h-[50vh] sm:max-h-[400px] overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="p-3 sm:p-4 text-center text-gray-500 text-xs sm:text-sm">
              <Bell className="h-7 w-7 sm:h-8 sm:w-8 mx-auto mb-2 text-gray-400" />
              <p>No notifications yet</p>
              <p className="text-xs text-gray-400 mt-1">
                You&apos;ll be notified about order updates here
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              {notifications.map((notification) => {
                const display = getNotificationDisplay(notification.type);
                const Icon = display.icon;
                const productImage = getProductImage(notification);
                const productName = getProductName(notification);

                return (
                  <button
                    key={notification.id}
                    onClick={() => handleNotificationClick(notification)}
                    className={cn(
                      'w-full text-left p-2.5 sm:p-3 hover:bg-gray-50 transition-colors border-b border-gray-100 last:border-0 cursor-pointer',
                      !notification.is_read && 'bg-amber-50/50'
                    )}
                  >
                    <div className="flex items-start gap-2 sm:gap-3">
                      {/* Product Image or Icon */}
                      <div className="flex-shrink-0 relative">
                        {productImage ? (
                          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-md overflow-hidden bg-gray-100 relative">
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
                            "w-10 h-10 sm:w-12 sm:h-12 rounded-md flex items-center justify-center",
                            display.color
                          )}>
                            <Icon className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
                          </div>
                        )}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs sm:text-sm font-medium text-gray-900">
                          {display.title}
                        </p>
                        <p className="text-xs text-gray-600 truncate mt-0.5">
                          {productName}
                        </p>
                        {notification.purchase?.order_number && (
                          <p className="text-xs text-gray-500 mt-0.5">
                            Order #{notification.purchase.order_number}
                          </p>
                        )}
                        <p className="text-xs text-gray-400 mt-0.5 sm:mt-1">
                          {formatDistanceToNow(new Date(notification.created_at), {
                            addSuffix: true,
                          })}
                        </p>
                      </div>

                      {/* Unread Indicator */}
                      {!notification.is_read && (
                        <div className="flex-shrink-0 w-2 h-2 rounded-full bg-amber-500 mt-1" />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <DropdownMenuSeparator />

        {/* View All Button */}
        <div className="p-1.5 sm:p-2">
          <Button
            variant="ghost"
            className="w-full rounded-md text-xs sm:text-sm cursor-pointer"
            onClick={handleViewAll}
          >
            View All Orders
          </Button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

