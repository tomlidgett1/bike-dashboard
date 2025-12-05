'use client'

import React from 'react'
import { QuestionCard } from '@/components/onboarding'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Loader2, Store, MapPin } from 'lucide-react'

interface BusinessDetailsStepProps {
  businessName: string
  address: string
  onUpdate: (data: { businessName?: string; address?: string }) => void
  onNext: () => void
  loading?: boolean
}

export function BusinessDetailsStep({
  businessName,
  address,
  onUpdate,
  onNext,
  loading = false,
}: BusinessDetailsStepProps) {
  const isValid = businessName.trim().length > 0 && address.trim().length > 0

  return (
    <QuestionCard
      title="Tell us about your business"
      description="We'll use this information to set up your store profile."
    >
      <div className="space-y-4 sm:space-y-5 md:space-y-6">
        {/* Business Name */}
        <div className="space-y-1.5 sm:space-y-2">
          <Label htmlFor="businessName" className="text-xs sm:text-sm font-medium">
            Business Name
          </Label>
          <div className="relative">
            <Store className="absolute left-2.5 sm:left-3 top-1/2 -translate-y-1/2 h-4 w-4 sm:h-5 sm:w-5 text-gray-400" />
            <Input
              id="businessName"
              type="text"
              placeholder="e.g., Bike Shop Melbourne"
              value={businessName}
              onChange={(e) => onUpdate({ businessName: e.target.value })}
              className="pl-9 sm:pl-10 h-11 sm:h-12 rounded-md text-sm sm:text-base"
              disabled={loading}
            />
          </div>
        </div>

        {/* Address */}
        <div className="space-y-1.5 sm:space-y-2">
          <Label htmlFor="address" className="text-xs sm:text-sm font-medium">
            Business Location
          </Label>
          <div className="relative">
            <MapPin className="absolute left-2.5 sm:left-3 top-1/2 -translate-y-1/2 h-4 w-4 sm:h-5 sm:w-5 text-gray-400" />
            <Input
              id="address"
              type="text"
              placeholder="e.g., 123 Collins St, Melbourne VIC 3000"
              value={address}
              onChange={(e) => onUpdate({ address: e.target.value })}
              className="pl-9 sm:pl-10 h-11 sm:h-12 rounded-md text-sm sm:text-base"
              disabled={loading}
            />
          </div>
          <p className="text-[10px] sm:text-xs text-gray-500 leading-relaxed">
            Enter your full business address including suburb and postcode
          </p>
        </div>

        {/* Info Box */}
        <div className="bg-white border border-gray-200 rounded-md p-3 sm:p-4">
          <p className="text-xs sm:text-sm text-gray-600 leading-relaxed">
            <strong>Note:</strong> Your business account will need to be verified by an admin before you can access store features.
          </p>
        </div>

        {/* Continue Button */}
        <Button
          onClick={onNext}
          disabled={!isValid || loading}
          size="lg"
          className="w-full rounded-md h-11 sm:h-12 text-sm sm:text-base font-medium mt-2"
        >
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 sm:h-5 sm:w-5 animate-spin" />
              Setting up...
            </>
          ) : (
            'Complete Setup'
          )}
        </Button>
      </div>
    </QuestionCard>
  )
}



