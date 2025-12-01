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
      <div className="space-y-6">
        {/* First Name */}
        <div className="space-y-2">
          <Label htmlFor="firstName" className="text-sm font-medium">
            First Name
          </Label>
          <div className="relative">
            <User className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
            <Input
              id="firstName"
              type="text"
              placeholder="John"
              value={firstName}
              onChange={(e) => onUpdate({ firstName: e.target.value })}
              className="pl-10 h-12 rounded-md"
              autoFocus
            />
          </div>
        </div>

        {/* Last Name */}
        <div className="space-y-2">
          <Label htmlFor="lastName" className="text-sm font-medium">
            Last Name
          </Label>
          <div className="relative">
            <User className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
            <Input
              id="lastName"
              type="text"
              placeholder="Smith"
              value={lastName}
              onChange={(e) => onUpdate({ lastName: e.target.value })}
              className="pl-10 h-12 rounded-md"
            />
          </div>
        </div>

        {/* Email (Read-only) */}
        <div className="space-y-2">
          <Label htmlFor="email" className="text-sm font-medium">
            Email Address
          </Label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
            <Input
              id="email"
              type="email"
              value={email}
              className="pl-10 h-12 rounded-md bg-gray-50"
              disabled
            />
          </div>
        </div>

        {/* Continue Button */}
        <Button
          onClick={onNext}
          disabled={!isValid}
          size="lg"
          className="w-full rounded-md"
        >
          Continue
        </Button>
      </div>
    </QuestionCard>
  )
}

