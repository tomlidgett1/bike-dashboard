'use client';

import * as React from 'react';
import { CheckCircle2, AlertCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { MarketplaceReadiness } from '@/lib/marketplace/product-readiness';
import { cn } from '@/lib/utils';

interface MarketplaceReadinessBadgesProps {
  readiness: MarketplaceReadiness;
  className?: string;
}

export function MarketplaceReadinessBadges({
  readiness,
  className,
}: MarketplaceReadinessBadgesProps) {
  if (readiness.isLive) {
    return (
      <div className={cn('flex flex-col items-start gap-1', className)}>
        <Badge
          variant="secondary"
          className="rounded-md gap-1 bg-white text-gray-800 border border-gray-200 shadow-sm font-medium"
        >
          <CheckCircle2 className="h-3 w-3 text-green-600" />
          Live
        </Badge>
      </div>
    );
  }

  return (
    <TooltipProvider delayDuration={200}>
      <div className={cn('flex flex-col items-start gap-1 max-w-[220px]', className)}>
        <Badge
          variant="secondary"
          className="rounded-md gap-1 bg-white text-gray-700 border border-gray-200 font-medium"
        >
          <AlertCircle className="h-3 w-3 text-gray-500" />
          Not live
        </Badge>
        <ul className="flex flex-col gap-1 w-full">
          {readiness.blockers.map((blocker) => (
            <li key={blocker.id}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex w-full">
                    <Badge
                      variant="outline"
                      className="rounded-md text-[11px] font-normal text-gray-700 border-gray-200 bg-white truncate max-w-full cursor-default"
                    >
                      {blocker.label}
                    </Badge>
                  </span>
                </TooltipTrigger>
                <TooltipContent
                  side="left"
                  className="max-w-xs rounded-md bg-white text-gray-800 border border-gray-200 shadow-md"
                >
                  <p className="text-xs font-medium text-gray-900">{blocker.label}</p>
                  <p className="text-xs text-gray-600 mt-0.5">{blocker.action}</p>
                </TooltipContent>
              </Tooltip>
            </li>
          ))}
        </ul>
      </div>
    </TooltipProvider>
  );
}
