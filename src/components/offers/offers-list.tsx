// ============================================================
// OFFERS LIST COMPONENT
// ============================================================
// Main list view for offers with filtering
// Mobile-optimised with cleaner layout and better empty states

'use client';

import { useOffers } from '@/lib/hooks/use-offers';
import { OfferCard } from './offer-card';
import { Tag, Loader2, ShoppingBag } from 'lucide-react';
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
      <div className="flex flex-col items-center justify-center h-full py-16">
        <Loader2 className="h-8 w-8 text-gray-400 animate-spin mb-3" />
        <p className="text-sm text-gray-500">Loading offers...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-16 px-6">
        <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center mb-4">
          <Tag className="h-8 w-8 text-red-400" />
        </div>
        <p className="text-base font-medium text-gray-900 text-center mb-1">Unable to load offers</p>
        <p className="text-sm text-gray-500 text-center">{error}</p>
      </div>
    );
  }

  if (offers.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-16 px-6">
        <div className="w-20 h-20 rounded-full bg-gray-100 flex items-center justify-center mb-5">
          {role === 'buyer' ? (
            <ShoppingBag className="h-10 w-10 text-gray-400" />
          ) : (
            <Tag className="h-10 w-10 text-gray-400" />
          )}
        </div>
        <p className="text-base font-medium text-gray-900 text-center mb-1">
          {role === 'buyer' ? 'No offers sent' : 'No offers received'}
        </p>
        <p className="text-sm text-gray-500 text-center max-w-[260px]">
          {role === 'buyer' 
            ? 'Browse the marketplace and make an offer on items you\'re interested in' 
            : 'When buyers make offers on your listings, they\'ll appear here'}
        </p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      {/* Stats Summary - Hidden on mobile, shown on desktop */}
      {stats && (
        <div className="hidden md:block sticky top-0 bg-gray-50 border-b border-gray-200 p-3 z-10">
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
      <div className="p-3 md:p-4 space-y-3">
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
