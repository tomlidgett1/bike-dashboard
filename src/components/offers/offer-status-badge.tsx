// ============================================================
// OFFER STATUS BADGE COMPONENT
// ============================================================
// Color-coded badge showing offer status

'use client';

import { cn } from '@/lib/utils';
import { getOfferStatusColor, getOfferStatusLabel, type OfferStatus, formatTimeRemaining, getTimeRemaining } from '@/lib/types/offer';
import type { OfferStatusBadgeProps } from '@/lib/types/offer';
import { Clock } from 'lucide-react';

export function OfferStatusBadge({ status, expiresAt, className }: OfferStatusBadgeProps) {
  const showTimer = status === 'pending' || status === 'countered';
  const timeRemaining = expiresAt && showTimer ? getTimeRemaining(expiresAt) : null;
  const isUrgent = timeRemaining !== null && timeRemaining < 24 * 60 * 60 * 1000; // Less than 24 hours

  return (
    <div className="flex items-center gap-2">
      <span
        className={cn(
          'inline-flex items-center px-2.5 py-1 text-xs font-medium border rounded-md',
          getOfferStatusColor(status),
          className
        )}
      >
        {getOfferStatusLabel(status)}
      </span>
      {timeRemaining !== null && timeRemaining > 0 && (
        <span
          className={cn(
            'inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md',
            isUrgent ? 'bg-red-50 text-red-700' : 'bg-gray-50 text-gray-600'
          )}
        >
          <Clock className="h-3 w-3" />
          {formatTimeRemaining(timeRemaining)}
        </span>
      )}
    </div>
  );
}

