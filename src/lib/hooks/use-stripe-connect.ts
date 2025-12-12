// ============================================================
// useStripeConnect Hook
// ============================================================
// React hook for managing Stripe Connect status

import { useState, useEffect, useCallback } from 'react';

// ============================================================
// Types
// ============================================================

export interface StripeConnectStatus {
  connected: boolean;
  accountId?: string;
  status: 'not_connected' | 'pending' | 'active' | 'restricted' | 'disabled';
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  onboardingComplete: boolean;
  chargesEnabled?: boolean;
  requirements?: string[];
  connectedAt?: string;
  cached?: boolean;
}

interface UseStripeConnectReturn {
  status: StripeConnectStatus | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  createAccount: () => Promise<string | null>;
  getOnboardingLink: () => Promise<string | null>;
  getDashboardLink: () => Promise<string | null>;
}

// ============================================================
// Hook
// ============================================================

export function useStripeConnect(): UseStripeConnectReturn {
  const [status, setStatus] = useState<StripeConnectStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch status
  const fetchStatus = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch('/api/stripe/connect/status');
      
      if (!response.ok) {
        throw new Error('Failed to fetch status');
      }

      const data = await response.json();
      setStatus(data);
    } catch (err) {
      console.error('[useStripeConnect] Error:', err);
      setError(err instanceof Error ? err.message : 'Failed to load status');
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // Create new account
  const createAccount = useCallback(async (): Promise<string | null> => {
    try {
      const response = await fetch('/api/stripe/connect/create-account', {
        method: 'POST',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to create account');
      }

      const data = await response.json();
      return data.url || null;
    } catch (err) {
      console.error('[useStripeConnect] Create error:', err);
      setError(err instanceof Error ? err.message : 'Failed to create account');
      return null;
    }
  }, []);

  // Get onboarding link
  const getOnboardingLink = useCallback(async (): Promise<string | null> => {
    try {
      const response = await fetch('/api/stripe/connect/onboarding-link', {
        method: 'POST',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to get onboarding link');
      }

      const data = await response.json();
      return data.url || null;
    } catch (err) {
      console.error('[useStripeConnect] Onboarding error:', err);
      setError(err instanceof Error ? err.message : 'Failed to get link');
      return null;
    }
  }, []);

  // Get dashboard link
  const getDashboardLink = useCallback(async (): Promise<string | null> => {
    try {
      const response = await fetch('/api/stripe/connect/dashboard-link', {
        method: 'POST',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to get dashboard link');
      }

      const data = await response.json();
      return data.url || null;
    } catch (err) {
      console.error('[useStripeConnect] Dashboard error:', err);
      setError(err instanceof Error ? err.message : 'Failed to get link');
      return null;
    }
  }, []);

  return {
    status,
    loading,
    error,
    refetch: fetchStatus,
    createAccount,
    getOnboardingLink,
    getDashboardLink,
  };
}

