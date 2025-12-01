'use client'

import React, { useState } from 'react'
import { QuestionCard, MultiSelectOption } from '@/components/onboarding'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface BrandPreferenceStepProps {
  selected: string[]
  onUpdate: (selected: string[]) => void
  onNext: () => void
}

const popularBrands = [
  'Specialized',
  'Trek',
  'Giant',
  'Cannondale',
  'Scott',
  'Santa Cruz',
  'Cervélo',
  'Pinarello',
  'Bianchi',
  'Merida',
]

export function BrandPreferenceStep({ selected, onUpdate, onNext }: BrandPreferenceStepProps) {
  const [customBrand, setCustomBrand] = useState('')

  const handleToggle = (brand: string) => {
    if (selected.includes(brand)) {
      onUpdate(selected.filter((s) => s !== brand))
    } else {
      onUpdate([...selected, brand])
    }
  }

  const handleAddCustom = () => {
    const brand = customBrand.trim()
    if (brand && !selected.includes(brand)) {
      onUpdate([...selected, brand])
      setCustomBrand('')
    }
  }

  const handleSkip = () => {
    onNext()
  }

  return (
    <QuestionCard
      title="What bike brands do you like or are interested in?"
      description="Select your favourite brands or add your own. You can skip this if you're not sure."
    >
      <div className="space-y-3">
        {popularBrands.map((brand) => (
          <MultiSelectOption
            key={brand}
            id={brand}
            label={brand}
            checked={selected.includes(brand)}
            onCheckedChange={() => handleToggle(brand)}
          />
        ))}

        {/* Custom Brands */}
        {selected.filter((b) => !popularBrands.includes(b)).map((brand) => (
          <MultiSelectOption
            key={brand}
            id={brand}
            label={brand}
            checked={true}
            onCheckedChange={() => handleToggle(brand)}
          />
        ))}
      </div>

      {/* Add Custom Brand */}
      <div className="space-y-2 mt-6">
        <Label htmlFor="customBrand" className="text-sm font-medium">
          Or add another brand
        </Label>
        <div className="flex gap-2">
          <Input
            id="customBrand"
            type="text"
            placeholder="Enter brand name"
            value={customBrand}
            onChange={(e) => setCustomBrand(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleAddCustom()}
            className="rounded-md"
          />
          <Button
            onClick={handleAddCustom}
            disabled={!customBrand.trim()}
            variant="outline"
            className="rounded-md"
          >
            Add
          </Button>
        </div>
      </div>

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
          disabled={selected.length === 0}
          size="lg"
          className="flex-1 rounded-md"
        >
          Continue
        </Button>
      </div>
    </QuestionCard>
  )
}

