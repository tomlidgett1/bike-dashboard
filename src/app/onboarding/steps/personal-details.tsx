'use client'

import React from 'react'
import { QuestionCard } from '@/components/onboarding'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { User, Mail } from 'lucide-react'

interface PersonalDetailsStepProps {
  firstName: string
  lastName: string
  email: string
  onUpdate: (data: { firstName?: string; lastName?: string }) => void
  onNext: () => void
}

export function PersonalDetailsStep({
  firstName,
  lastName,
  email,
  onUpdate,
  onNext,
}: PersonalDetailsStepProps) {
  const isValid = firstName.trim().length > 0 && lastName.trim().length > 0

  return (
    <QuestionCard
      title="Let's get to know you"
      description="Tell us a bit about yourself to personalise your experience."
    >
      <div className="space-y-4 sm:space-y-5 md:space-y-6">
        {/* First Name */}
        <div className="space-y-1.5 sm:space-y-2">
          <Label htmlFor="firstName" className="text-xs sm:text-sm font-medium">
            First Name
          </Label>
          <div className="relative">
            <User className="absolute left-2.5 sm:left-3 top-1/2 -translate-y-1/2 h-4 w-4 sm:h-5 sm:w-5 text-gray-400" />
            <Input
              id="firstName"
              type="text"
              placeholder="John"
              value={firstName}
              onChange={(e) => onUpdate({ firstName: e.target.value })}
              className="pl-9 sm:pl-10 h-11 sm:h-12 rounded-md text-sm sm:text-base"
              autoFocus
            />
          </div>
        </div>

        {/* Last Name */}
        <div className="space-y-1.5 sm:space-y-2">
          <Label htmlFor="lastName" className="text-xs sm:text-sm font-medium">
            Last Name
          </Label>
          <div className="relative">
            <User className="absolute left-2.5 sm:left-3 top-1/2 -translate-y-1/2 h-4 w-4 sm:h-5 sm:w-5 text-gray-400" />
            <Input
              id="lastName"
              type="text"
              placeholder="Smith"
              value={lastName}
              onChange={(e) => onUpdate({ lastName: e.target.value })}
              className="pl-9 sm:pl-10 h-11 sm:h-12 rounded-md text-sm sm:text-base"
            />
          </div>
        </div>

        {/* Email (Read-only) */}
        <div className="space-y-1.5 sm:space-y-2">
          <Label htmlFor="email" className="text-xs sm:text-sm font-medium">
            Email Address
          </Label>
          <div className="relative">
            <Mail className="absolute left-2.5 sm:left-3 top-1/2 -translate-y-1/2 h-4 w-4 sm:h-5 sm:w-5 text-gray-400" />
            <Input
              id="email"
              type="email"
              value={email}
              className="pl-9 sm:pl-10 h-11 sm:h-12 rounded-md bg-gray-50 text-sm sm:text-base"
              disabled
            />
          </div>
        </div>

        {/* Continue Button */}
        <Button
          onClick={onNext}
          disabled={!isValid}
          size="lg"
          className="w-full rounded-md h-11 sm:h-12 text-sm sm:text-base font-medium mt-2"
        >
          Continue
        </Button>
      </div>
    </QuestionCard>
  )
}



