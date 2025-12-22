"use client";

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/components/providers/auth-provider';

// ============================================================
// User Vouchers Hook
// ============================================================
// Provides voucher state and eligibility for the current user

export interface VoucherInfo {
  id: string;
  voucher_type: string;
  amount_cents: number;
  min_purchase_cents: number;
  status: string;
  description: string;
  expires_at: string | null;
  created_at: string;
}

export interface UseUserVouchersResult {
  /** Whether user is eligible for the first upload promo (has 0 listings) */
  eligibleForFirstUploadPromo: boolean;
  /** Number of listings user has */
  listingCount: number;
  /** User's active vouchers */
  activeVouchers: VoucherInfo[];
  /** Loading state */
  isLoading: boolean;
  /** Error message if any */
  error: string | null;
  /** Refresh voucher data */
  refresh: () => Promise<void>;
  /** Get the best applicable voucher for a purchase amount (in cents) */
  getApplicableVoucher: (amountCents: number) => VoucherInfo | null;
}

export function useUserVouchers(): UseUserVouchersResult {
  const { user } = useAuth();
  const [eligibleForFirstUploadPromo, setEligibleForFirstUploadPromo] = useState(false);
  const [listingCount, setListingCount] = useState(0);
  const [activeVouchers, setActiveVouchers] = useState<VoucherInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchVouchers = useCallback(async () => {
    if (!user) {
      setIsLoading(false);
      setEligibleForFirstUploadPromo(false);
      setListingCount(0);
      setActiveVouchers([]);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/vouchers/check');
      
      if (!response.ok) {
        throw new Error('Failed to fetch voucher data');
      }

      const data = await response.json();
      
      setEligibleForFirstUploadPromo(data.eligibleForFirstUploadPromo);
      setListingCount(data.listingCount);
      setActiveVouchers(data.activeVouchers || []);
    } catch (err) {
      console.error('[useUserVouchers] Error:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchVouchers();
  }, [fetchVouchers]);

  const getApplicableVoucher = useCallback((amountCents: number): VoucherInfo | null => {
    const applicable = activeVouchers
      .filter(v => v.min_purchase_cents <= amountCents)
      .sort((a, b) => b.amount_cents - a.amount_cents);
    
    return applicable[0] || null;
  }, [activeVouchers]);

  return {
    eligibleForFirstUploadPromo,
    listingCount,
    activeVouchers,
    isLoading,
    error,
    refresh: fetchVouchers,
    getApplicableVoucher,
  };
}

