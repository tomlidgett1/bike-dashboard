// ============================================================
// OFFER STATUS BADGE COMPONENT
// ============================================================
// Clean, minimal status indicator

'use client';

import { cn } from '@/lib/utils';
import type { OfferStatusBadgeProps } from '@/lib/types/offer';

function getStatusConfig(status: string): { label: string; bg: string; text: string } {
  switch (status) {
    case 'pending':
      return { label: 'Pending', bg: 'bg-gray-100', text: 'text-gray-600' };
    case 'countered':
      return { label: 'Counter Offer', bg: 'bg-blue-50', text: 'text-blue-600' };
    case 'accepted':
      return { label: 'Accepted', bg: 'bg-green-50', text: 'text-green-600' };
    case 'rejected':
      return { label: 'Declined', bg: 'bg-gray-100', text: 'text-gray-500' };
    case 'expired':
      return { label: 'Expired', bg: 'bg-gray-100', text: 'text-gray-400' };
    case 'cancelled':
      return { label: 'Cancelled', bg: 'bg-gray-100', text: 'text-gray-400' };
    default:
      return { label: status, bg: 'bg-gray-100', text: 'text-gray-600' };
  }
}

export function OfferStatusBadge({ 
  status, 
  paymentStatus,
  className 
}: OfferStatusBadgeProps) {
  const config = getStatusConfig(status);

  // Override for payment states on accepted offers
  let displayConfig = config;
  if (status === 'accepted' && paymentStatus) {
    if (paymentStatus === 'paid') {
      displayConfig = { label: 'Paid', bg: 'bg-green-50', text: 'text-green-600' };
    } else if (paymentStatus === 'pending') {
      displayConfig = { label: 'Pay Now', bg: 'bg-gray-900', text: 'text-white' };
    } else if (paymentStatus === 'failed') {
      displayConfig = { label: 'Payment Failed', bg: 'bg-red-50', text: 'text-red-600' };
    }
  }

  return (
    <span
      className={cn(
        'inline-flex items-center px-2.5 py-1 text-xs font-medium rounded-full',
        displayConfig.bg,
        displayConfig.text,
        className
      )}
    >
      {displayConfig.label}
    </span>
  );
}
