'use client'

import React from 'react'
import { QuestionCard, SingleSelectOption } from '@/components/onboarding'
import { Button } from '@/components/ui/button'
import { RadioGroup } from '@/components/ui/radio-group'
import { DollarSign } from 'lucide-react'

interface BudgetRangeStepProps {
  selected: string
  onUpdate: (selected: string) => void
  onNext: () => void
}

const budgetRanges = [
  { value: 'under-500', label: 'Under $500', description: 'Entry-level bikes' },
  { value: '500-1000', label: '$500 - $1,000', description: 'Great starter bikes' },
  { value: '1000-2500', label: '$1,000 - $2,500', description: 'Mid-range quality' },
  { value: '2500-5000', label: '$2,500 - $5,000', description: 'High-performance bikes' },
  { value: 'over-5000', label: 'Over $5,000', description: 'Premium and professional' },
]

export function BudgetRangeStep({ selected, onUpdate, onNext }: BudgetRangeStepProps) {
  const isValid = selected.length > 0

  const handleSkip = () => {
    onNext()
  }

  return (
    <QuestionCard
      title="What's your typical budget range for bike purchases?"
      description="This helps us show bikes within your price range. You can skip this if you prefer."
    >
      <RadioGroup value={selected} onValueChange={onUpdate}>
        <div className="space-y-3">
          {budgetRanges.map((range) => (
            <SingleSelectOption
              key={range.value}
              id={range.value}
              value={range.value}
              label={range.label}
              description={range.description}
              checked={selected === range.value}
              icon={<DollarSign className="h-4 w-4" />}
            />
          ))}
        </div>
      </RadioGroup>

      <div className="flex gap-3 mt-6">
        <Button
          onClick={handleSkip}
          variant="outline"
          size="lg"
          className="flex-1 rounded-md"
        >
          Skip
        </Button>
        <Button
          onClick={onNext}
          disabled={!isValid}
          size="lg"
          className="flex-1 rounded-md"
        >
          Continue
        </Button>
      </div>
    </QuestionCard>
  )
}

