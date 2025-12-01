'use client'

import React from 'react'
import { QuestionCard, MultiSelectOption } from '@/components/onboarding'
import { Button } from '@/components/ui/button'
import { Bike, Box, Circle, Cog, Wrench, ShoppingBag, Shirt } from 'lucide-react'

interface InterestsStepProps {
  selected: string[]
  onUpdate: (selected: string[]) => void
  onNext: () => void
}

const interests = [
  { value: 'complete-bikes', label: 'Complete bikes', icon: <Bike className="h-4 w-4" /> },
  { value: 'frames', label: 'Frames', icon: <Box className="h-4 w-4" /> },
  { value: 'wheels', label: 'Wheels', icon: <Circle className="h-4 w-4" /> },
  { value: 'groupsets', label: 'Groupsets', icon: <Cog className="h-4 w-4" /> },
  { value: 'accessories', label: 'Accessories', icon: <ShoppingBag className="h-4 w-4" /> },
  { value: 'bike-parts', label: 'Bike parts', icon: <Wrench className="h-4 w-4" /> },
  { value: 'clothing-gear', label: 'Clothing/Gear', icon: <Shirt className="h-4 w-4" /> },
]

export function InterestsStep({ selected, onUpdate, onNext }: InterestsStepProps) {
  const handleToggle = (value: string) => {
    if (selected.includes(value)) {
      onUpdate(selected.filter((s) => s !== value))
    } else {
      onUpdate([...selected, value])
    }
  }

  const isValid = selected.length > 0

  return (
    <QuestionCard
      title="What bike components or accessories interest you most?"
      description="Select all that interest you. This helps us personalise your marketplace experience."
    >
      <div className="space-y-3">
        {interests.map((interest) => (
          <MultiSelectOption
            key={interest.value}
            id={interest.value}
            label={interest.label}
            checked={selected.includes(interest.value)}
            onCheckedChange={() => handleToggle(interest.value)}
            icon={interest.icon}
          />
        ))}
      </div>

      <Button
        onClick={onNext}
        disabled={!isValid}
        size="lg"
        className="w-full rounded-md mt-6"
      >
        Continue
      </Button>
    </QuestionCard>
  )
}

