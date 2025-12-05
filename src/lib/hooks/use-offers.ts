// ============================================================
// USE OFFERS HOOK
// ============================================================
// React hook for managing offers list and operations

'use client';

import { useState, useEffect, useCallback } from 'react';
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
// USE OFFERS - List offers
// ============================================================

interface UseOffersOptions {
  role?: OfferRole;
  status?: OfferStatus | OfferStatus[];
  productId?: string;
  page?: number;
  limit?: number;
  autoRefresh?: boolean;
}

export function useOffers(options: UseOffersOptions = {}) {
  const [offers, setOffers] = useState<EnrichedOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<GetOffersResponse['stats']>();

  const fetchOffers = useCallback(async () => {
    try {
      setLoading(true);
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
        let errorMessage = 'Failed to fetch offers';
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorData.message || errorMessage;
        } catch {
          errorMessage = `Server error: ${response.status} ${response.statusText}`;
        }
        throw new Error(errorMessage);
      }

      const data: GetOffersResponse = await response.json();
      setOffers(data.offers);
      setTotal(data.total);
      setStats(data.stats);
    } catch (err) {
      console.error('Error fetching offers:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch offers');
    } finally {
      setLoading(false);
    }
  }, [options.role, options.status, options.productId, options.page, options.limit]);

  useEffect(() => {
    fetchOffers();
  }, [fetchOffers]);

  // Auto-refresh every 30 seconds if enabled
  useEffect(() => {
    if (!options.autoRefresh) return;

    const interval = setInterval(() => {
      fetchOffers();
    }, 30000);

    return () => clearInterval(interval);
  }, [options.autoRefresh, fetchOffers]);

  return {
    offers,
    loading,
    error,
    total,
    stats,
    refresh: fetchOffers,
  };
}

// ============================================================
// USE OFFER - Single offer
// ============================================================

export function useOffer(offerId: string | null) {
  const [offer, setOffer] = useState<EnrichedOffer | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchOffer = useCallback(async () => {
    if (!offerId) {
      setOffer(null);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`/api/offers/${offerId}`);
      
      if (!response.ok) {
        let errorMessage = 'Failed to fetch offer';
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorData.message || errorMessage;
        } catch {
          errorMessage = `Server error: ${response.status} ${response.statusText}`;
        }
        throw new Error(errorMessage);
      }

      const data = await response.json();
      setOffer(data.offer);
    } catch (err) {
      console.error('Error fetching offer:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch offer');
    } finally {
      setLoading(false);
    }
  }, [offerId]);

  useEffect(() => {
    fetchOffer();
  }, [fetchOffer]);

  return {
    offer,
    loading,
    error,
    refresh: fetchOffer,
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

      if (!response.ok) {
        // Try to parse error message from JSON, but fallback if it's HTML
        let errorMessage = 'Failed to create offer';
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorData.message || errorMessage;
        } catch {
          // Response is not JSON (probably HTML error page)
          errorMessage = `Server error: ${response.status} ${response.statusText}`;
        }
        throw new Error(errorMessage);
      }

      const data: CreateOfferResponse = await response.json();
      return data.offer;
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

      if (!response.ok) {
        let errorMessage = 'Failed to accept offer';
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorData.message || errorMessage;
        } catch {
          errorMessage = `Server error: ${response.status} ${response.statusText}`;
        }
        throw new Error(errorMessage);
      }

      const data: AcceptOfferResponse = await response.json();
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

      if (!response.ok) {
        let errorMessage = 'Failed to reject offer';
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorData.message || errorMessage;
        } catch {
          errorMessage = `Server error: ${response.status} ${response.statusText}`;
        }
        throw new Error(errorMessage);
      }

      const data: RejectOfferResponse = await response.json();
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

      if (!response.ok) {
        let errorMessage = 'Failed to counter offer';
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorData.message || errorMessage;
        } catch {
          errorMessage = `Server error: ${response.status} ${response.statusText}`;
        }
        throw new Error(errorMessage);
      }

      const data: CounterOfferResponse = await response.json();
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

      if (!response.ok) {
        let errorMessage = 'Failed to cancel offer';
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorData.message || errorMessage;
        } catch {
          errorMessage = `Server error: ${response.status} ${response.statusText}`;
        }
        throw new Error(errorMessage);
      }

      const data: CancelOfferResponse = await response.json();
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

