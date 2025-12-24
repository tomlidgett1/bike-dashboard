// ============================================================
// ORDER NOTIFICATIONS CONTEXT PROVIDER
// ============================================================
// Provides order notifications state to all components that need it
// Ensures the hook only runs ONCE regardless of how many consumers exist

'use client';

import * as React from 'react';
import { useOrderNotifications, type OrderNotification } from '@/lib/hooks/use-order-notifications';
import { useAuth } from '@/components/providers/auth-provider';

interface OrderNotificationsContextValue {
  notifications: OrderNotification[];
  unreadCount: number;
  loading: boolean;
  error: string | null;
  markAsRead: (notificationId: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  refresh: () => void;
}

const OrderNotificationsContext = React.createContext<OrderNotificationsContextValue | null>(null);

export function OrderNotificationsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  
  // Defer notifications fetching until after initial render to prevent blocking page load
  // This significantly improves LCP (Largest Contentful Paint) on product pages
  const [shouldFetch, setShouldFetch] = React.useState(false);
  
  React.useEffect(() => {
    // Only start deferral timer if user is authenticated
    if (!user) {
      setShouldFetch(false);
      return;
    }
    
    // Defer fetching by 1 second to prioritize main content rendering
    const timer = setTimeout(() => {
      setShouldFetch(true);
    }, 1000);
    
    return () => clearTimeout(timer);
  }, [user]);
  
  const {
    notifications,
    unreadCount,
    loading,
    error,
    markAsRead,
    markAllAsRead,
    refresh,
  } = useOrderNotifications(10, false, user ? shouldFetch : false);

  const value = React.useMemo(() => ({
    notifications,
    unreadCount,
    loading,
    error,
    markAsRead,
    markAllAsRead,
    refresh,
  }), [notifications, unreadCount, loading, error, markAsRead, markAllAsRead, refresh]);

  return (
    <OrderNotificationsContext.Provider value={value}>
      {children}
    </OrderNotificationsContext.Provider>
  );
}

export function useOrderNotificationsContext() {
  const context = React.useContext(OrderNotificationsContext);
  if (!context) {
    // Return a default value if not within provider (for SSR or when provider is not mounted)
    return {
      notifications: [],
      unreadCount: 0,
      loading: false,
      error: null,
      markAsRead: async () => {},
      markAllAsRead: async () => {},
      refresh: () => {},
    };
  }
  return context;
}

