'use client'

import React from 'react'
import { QuestionCard, MultiSelectOption } from '@/components/onboarding'
import { Button } from '@/components/ui/button'
import { Mountain, Bike, Briefcase, Zap, Compass, Trophy } from 'lucide-react'

interface RidingStyleStepProps {
  selected: string[]
  onUpdate: (selected: string[]) => void
  onNext: () => void
}

const ridingStyles = [
  { value: 'mountain', label: 'Mountain biking', icon: <Mountain className="h-4 w-4" /> },
  { value: 'road', label: 'Road cycling', icon: <Bike className="h-4 w-4" /> },
  { value: 'commuting', label: 'Commuting', icon: <Briefcase className="h-4 w-4" /> },
  { value: 'bmx', label: 'BMX/Trick riding', icon: <Zap className="h-4 w-4" /> },
  { value: 'gravel', label: 'Gravel/Adventure', icon: <Compass className="h-4 w-4" /> },
  { value: 'track', label: 'Track/Velodrome', icon: <Trophy className="h-4 w-4" /> },
]

export function RidingStyleStep({ selected, onUpdate, onNext }: RidingStyleStepProps) {
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
      title="What type of bike riding do you prefer?"
      description="Select all that apply. This helps us show you the most relevant bikes."
    >
      <div className="space-y-3">
        {ridingStyles.map((style) => (
          <MultiSelectOption
            key={style.value}
            id={style.value}
            label={style.label}
            checked={selected.includes(style.value)}
            onCheckedChange={() => handleToggle(style.value)}
            icon={style.icon}
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

