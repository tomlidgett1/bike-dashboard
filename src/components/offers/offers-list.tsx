'use client';

import { useAuth } from '@/components/providers/auth-provider';
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

export function OffersList({ role, statusFilter, onOfferClick }: OffersListProps) {
  const { user } = useAuth();
  const { offers, loading, error } = useOffers({
    role,
    status: statusFilter,
    autoRefresh: true,
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-4 w-4 text-muted-foreground animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-12 px-6 text-center">
        <p className="text-xs text-muted-foreground">Unable to load offers</p>
      </div>
    );
  }

  if (offers.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-16 px-6 text-center">
        <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center mb-3">
          {role === 'buyer' ? (
            <ShoppingBag className="h-[18px] w-[18px] text-muted-foreground" />
          ) : (
            <Tag className="h-[18px] w-[18px] text-muted-foreground" />
          )}
        </div>
        <p className="text-sm font-medium text-foreground">No offers</p>
        <p className="text-xs text-muted-foreground mt-1 max-w-[180px] leading-relaxed">
          {role === 'buyer'
            ? 'Offers you send will appear here'
            : role === 'seller'
            ? 'Offers you receive will appear here'
            : 'All your offers will appear here'}
        </p>
      </div>
    );
  }

  return (
    <div className="p-1.5">
      {offers.map((offer) => {
        const offerRole: OfferRole =
          role || (offer.buyer_id === user?.id ? 'buyer' : 'seller');
        return (
          <OfferCard
            key={offer.id}
            offer={offer}
            role={offerRole}
            onViewDetails={onOfferClick}
          />
        );
      })}
    </div>
  );
}
