'use client'

import React from 'react'
import { QuestionCard, SingleSelectOption } from '@/components/onboarding'
import { Button } from '@/components/ui/button'
import { RadioGroup } from '@/components/ui/radio-group'
import { Sparkles, Award, Star, Trophy } from 'lucide-react'

interface ExperienceLevelStepProps {
  selected: string
  onUpdate: (selected: string) => void
  onNext: () => void
}

const experienceLevels = [
  {
    value: 'beginner',
    label: 'Beginner',
    description: 'Just getting started with cycling',
    icon: <Sparkles className="h-4 w-4" />,
  },
  {
    value: 'intermediate',
    label: 'Intermediate',
    description: 'Comfortable with regular rides',
    icon: <Award className="h-4 w-4" />,
  },
  {
    value: 'advanced',
    label: 'Advanced',
    description: 'Experienced cyclist, frequent rider',
    icon: <Star className="h-4 w-4" />,
  },
  {
    value: 'professional',
    label: 'Professional',
    description: 'Competitive or professional level',
    icon: <Trophy className="h-4 w-4" />,
  },
]

export function ExperienceLevelStep({ selected, onUpdate, onNext }: ExperienceLevelStepProps) {
  const isValid = selected.length > 0

  return (
    <QuestionCard
      title="What's your cycling experience level?"
      description="This helps us recommend bikes suited to your skill level."
    >
      <RadioGroup value={selected} onValueChange={onUpdate}>
        <div className="space-y-3">
          {experienceLevels.map((level) => (
            <SingleSelectOption
              key={level.value}
              id={level.value}
              value={level.value}
              label={level.label}
              description={level.description}
              checked={selected === level.value}
              icon={level.icon}
            />
          ))}
        </div>
      </RadioGroup>

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

