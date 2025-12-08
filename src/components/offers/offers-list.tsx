// ============================================================
// OFFERS LIST COMPONENT
// ============================================================
// Main list view for offers with filtering

'use client';

import { useState } from 'react';
import { useOffers } from '@/lib/hooks/use-offers';
import { OfferCard } from './offer-card';
import { cn } from '@/lib/utils';
import { Tag, Loader2 } from 'lucide-react';
import type { OfferRole, OfferStatus } from '@/lib/types/offer';

interface OffersListProps {
  role?: OfferRole;
  statusFilter?: OfferStatus | OfferStatus[];
  onOfferClick: (offerId: string) => void;
  onAccept?: (offerId: string) => void;
  onReject?: (offerId: string) => void;
  onCounter?: (offerId: string) => void;
  onCancel?: (offerId: string) => void;
  loadingOfferId?: string | null;
  loadingAction?: 'accept' | 'reject' | 'counter' | 'cancel';
}

export function OffersList({
  role,
  statusFilter,
  onOfferClick,
  onAccept,
  onReject,
  onCounter,
  onCancel,
  loadingOfferId,
  loadingAction,
}: OffersListProps) {
  const { offers, loading, error, stats } = useOffers({
    role,
    status: statusFilter,
    autoRefresh: true,
  });

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-12">
        <Loader2 className="h-8 w-8 text-gray-400 animate-spin mb-3" />
        <p className="text-sm text-gray-500">Loading offers...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-12">
        <div className="text-red-600 text-sm mb-2">Error loading offers</div>
        <p className="text-xs text-gray-500">{error}</p>
      </div>
    );
  }

  if (offers.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-12 px-4">
        <Tag className="h-12 w-12 text-gray-400 mb-4" />
        <p className="text-sm text-gray-500 text-center">
          {role === 'buyer' ? 'You haven\'t made any offers yet' : 'No offers received yet'}
        </p>
        <p className="text-xs text-gray-400 text-center mt-1">
          {role === 'buyer' ? 'Browse the marketplace to make your first offer' : 'Offers from buyers will appear here'}
        </p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      {/* Stats Summary */}
      {stats && (
        <div className="sticky top-0 bg-gray-50 border-b border-gray-200 p-3 z-10">
          <div className="flex gap-4 text-xs">
            <div>
              <span className="text-gray-600">Total:</span>{' '}
              <span className="font-semibold text-gray-900">{stats.total}</span>
            </div>
            <div>
              <span className="text-gray-600">Pending:</span>{' '}
              <span className="font-semibold text-gray-900">{stats.pending}</span>
            </div>
            <div>
              <span className="text-gray-600">Accepted:</span>{' '}
              <span className="font-semibold text-green-700">{stats.accepted}</span>
            </div>
          </div>
        </div>
      )}

      {/* Offers List */}
      <div className="p-3 space-y-3">
        {offers.map((offer) => (
          <OfferCard
            key={offer.id}
            offer={offer}
            role={role || 'buyer'}
            onViewDetails={onOfferClick}
            onAccept={onAccept}
            onReject={onReject}
            onCounter={onCounter}
            onCancel={onCancel}
            compact={false}
            loadingOfferId={loadingOfferId}
            loadingAction={loadingAction}
          />
        ))}
      </div>
    </div>
  );
}

