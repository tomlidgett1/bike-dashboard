// ============================================================
// USE OFFERS HOOK
// ============================================================
// React hook for managing offers list and operations
// Uses Supabase Realtime for instant updates instead of polling

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { RealtimeChannel } from '@supabase/supabase-js';
import type { 
  EnrichedOffer, 
  OfferRole, 
  OfferStatus, 
  GetOffersResponse,
  CreateOfferRequest,
  CreateOfferResponse,
  AcceptOfferResponse,
  RejectOfferResponse,
  CounterOfferRequest,
  CounterOfferResponse,
  CancelOfferResponse,
} from '@/lib/types/offer';

// ============================================================
// USE OFFERS - List offers with Realtime
// ============================================================

interface UseOffersOptions {
  role?: OfferRole;
  status?: OfferStatus | OfferStatus[];
  productId?: string;
  page?: number;
  limit?: number;
  autoRefresh?: boolean; // Now enables Realtime subscription instead of polling
}

export function useOffers(options: UseOffersOptions = {}) {
  const [offers, setOffers] = useState<EnrichedOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<GetOffersResponse['stats']>();
  const channelRef = useRef<RealtimeChannel | null>(null);
  const userIdRef = useRef<string | null>(null);
  const initialLoadCompleteRef = useRef(false);
  const fetchOffersRef = useRef<(silent?: boolean) => Promise<void>>(null!);

  // Fetch offers - silent mode for background refreshes
  const fetchOffers = useCallback(async (silent: boolean = false) => {
    try {
      // Only show loading spinner on initial load, not background refreshes
      if (!silent && !initialLoadCompleteRef.current) {
        setLoading(true);
      }
      setError(null);

      const params = new URLSearchParams();
      if (options.role) params.append('role', options.role);
      if (options.status) {
        const statusValue = Array.isArray(options.status) 
          ? options.status.join(',') 
          : options.status;
        params.append('status', statusValue);
      }
      if (options.productId) params.append('productId', options.productId);
      if (options.page) params.append('page', options.page.toString());
      if (options.limit) params.append('limit', options.limit.toString());

      const response = await fetch(`/api/offers?${params.toString()}`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch offers');
      }

      const data: GetOffersResponse = await response.json();
      setOffers(data.offers);
      setTotal(data.total);
      setStats(data.stats);
      initialLoadCompleteRef.current = true;
    } catch (err) {
      console.error('Error fetching offers:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch offers');
    } finally {
      setLoading(false);
    }
  }, [options.role, options.status, options.productId, options.page, options.limit]);

  // Keep ref updated with latest fetchOffers
  fetchOffersRef.current = fetchOffers;

  // Initial fetch
  useEffect(() => {
    fetchOffers(false);
  }, [options.role, options.status, options.productId, options.page, options.limit]);

  // Set up Supabase Realtime subscription (replaces polling)
  useEffect(() => {
    if (!options.autoRefresh) return;

    const supabase = createClient();
    let isMounted = true;

    const setupRealtime = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user || !isMounted) return;
      
      userIdRef.current = user.id;

      // Subscribe to offers table for this user (as buyer or seller)
      channelRef.current = supabase
        .channel('offers-realtime')
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'offers',
          },
          (payload) => {
            console.log('[Realtime] New offer:', payload);
            const newOffer = payload.new as any;
            // Only refresh if this offer involves the current user
            if (newOffer.buyer_id === userIdRef.current || newOffer.seller_id === userIdRef.current) {
              fetchOffersRef.current?.(true); // Silent refresh
            }
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'offers',
          },
          (payload) => {
            console.log('[Realtime] Offer update:', payload);
            const updatedOffer = payload.new as any;
            // Only refresh if this offer involves the current user
            if (updatedOffer.buyer_id === userIdRef.current || updatedOffer.seller_id === userIdRef.current) {
              fetchOffersRef.current?.(true); // Silent refresh
            }
          }
        )
        .subscribe((status, err) => {
          console.log('[Realtime] Offers subscription:', status, err || '');
        });
    };

    setupRealtime();

    // Cleanup subscription on unmount
    return () => {
      isMounted = false;
      if (channelRef.current) {
        channelRef.current.unsubscribe();
        channelRef.current = null;
      }
    };
  }, [options.autoRefresh]); // Only re-run if autoRefresh changes

  // Manual refresh (silent to avoid UI disruption)
  const refresh = useCallback(() => {
    fetchOffers(true);
  }, [fetchOffers]);

  return {
    offers,
    loading,
    error,
    total,
    stats,
    refresh,
  };
}

// ============================================================
// USE OFFER - Single offer with Realtime
// ============================================================

export function useOffer(offerId: string | null) {
  const [offer, setOffer] = useState<EnrichedOffer | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const initialLoadCompleteRef = useRef(false);

  // Fetch offer - silent mode for background refreshes
  const fetchOffer = useCallback(async (silent: boolean = false) => {
    if (!offerId) {
      setOffer(null);
      setLoading(false);
      return;
    }

    try {
      // Only show loading on initial load
      if (!silent && !initialLoadCompleteRef.current) {
        setLoading(true);
      }
      setError(null);

      const response = await fetch(`/api/offers/${offerId}`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch offer');
      }

      const data = await response.json();
      setOffer(data.offer);
      initialLoadCompleteRef.current = true;
    } catch (err) {
      console.error('Error fetching offer:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch offer');
    } finally {
      setLoading(false);
    }
  }, [offerId]);

  // Initial fetch
  useEffect(() => {
    initialLoadCompleteRef.current = false;
    fetchOffer(false);
  }, [offerId]);

  // Set up Realtime subscription for this specific offer
  useEffect(() => {
    if (!offerId) return;

    const supabase = createClient();

    // Subscribe to updates for this specific offer
    channelRef.current = supabase
      .channel(`offer-${offerId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'offers',
          filter: `id=eq.${offerId}`,
        },
        () => {
          // Offer was updated - silently refresh
          fetchOffer(true);
        }
      )
      .subscribe();

    // Cleanup subscription
    return () => {
      if (channelRef.current) {
        channelRef.current.unsubscribe();
        channelRef.current = null;
      }
    };
  }, [offerId, fetchOffer]);

  // Manual refresh (silent)
  const refresh = useCallback(() => {
    fetchOffer(true);
  }, [fetchOffer]);

  return {
    offer,
    loading,
    error,
    refresh,
  };
}

// ============================================================
// USE CREATE OFFER - Create offer mutation
// ============================================================

export function useCreateOffer() {
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createOffer = async (request: CreateOfferRequest): Promise<EnrichedOffer | null> => {
    try {
      setCreating(true);
      setError(null);

      const response = await fetch('/api/offers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      });

      const data = await response.json();

      if (!response.ok) {
        // API returns { error: '...' } for errors
        throw new Error(data.error || data.message || 'Failed to create offer');
      }

      return (data as CreateOfferResponse).offer;
    } catch (err) {
      console.error('Error creating offer:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to create offer';
      setError(errorMessage);
      throw err;
    } finally {
      setCreating(false);
    }
  };

  return {
    createOffer,
    creating,
    error,
  };
}

// ============================================================
// USE ACCEPT OFFER - Accept offer mutation
// ============================================================

export function useAcceptOffer() {
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const acceptOffer = async (offerId: string): Promise<EnrichedOffer | null> => {
    try {
      setAccepting(true);
      setError(null);

      const response = await fetch(`/api/offers/${offerId}/accept`, {
        method: 'PATCH',
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || data.message || 'Failed to accept offer');
      }

      return data.offer;
    } catch (err) {
      console.error('Error accepting offer:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to accept offer';
      setError(errorMessage);
      throw err;
    } finally {
      setAccepting(false);
    }
  };

  return {
    acceptOffer,
    accepting,
    error,
  };
}

// ============================================================
// USE REJECT OFFER - Reject offer mutation
// ============================================================

export function useRejectOffer() {
  const [rejecting, setRejecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rejectOffer = async (offerId: string): Promise<EnrichedOffer | null> => {
    try {
      setRejecting(true);
      setError(null);

      const response = await fetch(`/api/offers/${offerId}/reject`, {
        method: 'PATCH',
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || data.message || 'Failed to reject offer');
      }

      return data.offer;
    } catch (err) {
      console.error('Error rejecting offer:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to reject offer';
      setError(errorMessage);
      throw err;
    } finally {
      setRejecting(false);
    }
  };

  return {
    rejectOffer,
    rejecting,
    error,
  };
}

// ============================================================
// USE COUNTER OFFER - Counter offer mutation
// ============================================================

export function useCounterOffer() {
  const [countering, setCountering] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const counterOffer = async (
    offerId: string, 
    request: CounterOfferRequest
  ): Promise<EnrichedOffer | null> => {
    try {
      setCountering(true);
      setError(null);

      const response = await fetch(`/api/offers/${offerId}/counter`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || data.message || 'Failed to counter offer');
      }

      return data.offer;
    } catch (err) {
      console.error('Error countering offer:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to counter offer';
      setError(errorMessage);
      throw err;
    } finally {
      setCountering(false);
    }
  };

  return {
    counterOffer,
    countering,
    error,
  };
}

// ============================================================
// USE CANCEL OFFER - Cancel offer mutation
// ============================================================

export function useCancelOffer() {
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cancelOffer = async (offerId: string): Promise<EnrichedOffer | null> => {
    try {
      setCancelling(true);
      setError(null);

      const response = await fetch(`/api/offers/${offerId}/cancel`, {
        method: 'PATCH',
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || data.message || 'Failed to cancel offer');
      }

      return data.offer;
    } catch (err) {
      console.error('Error cancelling offer:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to cancel offer';
      setError(errorMessage);
      throw err;
    } finally {
      setCancelling(false);
    }
  };

  return {
    cancelOffer,
    cancelling,
    error,
  };
}

