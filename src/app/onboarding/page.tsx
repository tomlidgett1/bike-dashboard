'use client'

import React, { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/components/providers/auth-provider'
import { OnboardingLayout } from '@/components/onboarding'
import { Button } from '@/components/ui/button'
import { Loader2 } from 'lucide-react'

// Import step components
import { BusinessDetailsStep } from './steps/business-details'
import { PersonalDetailsStep } from './steps/personal-details'
import { RidingStyleStep } from './steps/riding-style'
import { BrandPreferenceStep } from './steps/brand-preference'
import { ExperienceLevelStep } from './steps/experience-level'
import { BudgetRangeStep } from './steps/budget-range'
import { InterestsStep } from './steps/interests'

export default function OnboardingPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user } = useAuth()
  const supabase = createClient()

  const accountType = searchParams.get('type') as 'individual' | 'bicycle_store' || 'individual'
  
  const [currentStep, setCurrentStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Form data state
  const [formData, setFormData] = useState({
    // Business fields
    businessName: '',
    address: '',
    
    // Individual fields
    firstName: '',
    lastName: '',
    
    // Preferences
    ridingStyles: [] as string[],
    preferredBrands: [] as string[],
    experienceLevel: '',
    budgetRange: '',
    interests: [] as string[],
  })

  // Calculate total steps based on account type
  const totalSteps = accountType === 'bicycle_store' ? 1 : 7

  useEffect(() => {
    if (!user) {
      router.push('/login')
    }
  }, [user, router])

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1)
    }
  }

  const handleNext = () => {
    if (currentStep < totalSteps) {
      setCurrentStep(currentStep + 1)
    }
  }

  const updateFormData = (data: Partial<typeof formData>) => {
    setFormData({ ...formData, ...data })
  }

  const handleComplete = async () => {
    if (!user) return

    setLoading(true)
    setError(null)

    try {
      const profileData: any = {
        onboarding_completed: true,
      }

      if (accountType === 'bicycle_store') {
        // Business account
        profileData.business_name = formData.businessName
        profileData.address = formData.address
        profileData.name = formData.businessName // Use business name as display name
      } else {
        // Individual account
        profileData.first_name = formData.firstName
        profileData.last_name = formData.lastName
        profileData.name = `${formData.firstName} ${formData.lastName}`.trim()
        profileData.preferences = {
          riding_styles: formData.ridingStyles,
          preferred_brands: formData.preferredBrands,
          experience_level: formData.experienceLevel,
          budget_range: formData.budgetRange,
          interests: formData.interests,
        }
      }

      const { error: updateError } = await supabase
        .from('users')
        .update(profileData)
        .eq('user_id', user.id)

      if (updateError) throw updateError

      // Redirect based on account type
      if (accountType === 'bicycle_store') {
        router.push('/marketplace') // Unverified stores go to marketplace
      } else {
        router.push('/marketplace') // Individuals go to marketplace
      }
      
      router.refresh()
    } catch (err: any) {
      console.error('Error completing onboarding:', err)
      setError(err.message || 'Failed to complete onboarding')
    } finally {
      setLoading(false)
    }
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    )
  }

  const renderStep = () => {
    if (accountType === 'bicycle_store') {
      return (
        <BusinessDetailsStep
          businessName={formData.businessName}
          address={formData.address}
          onUpdate={updateFormData}
          onNext={handleComplete}
          loading={loading}
        />
      )
    }

    // Individual account flow
    switch (currentStep) {
      case 1:
        return (
          <PersonalDetailsStep
            firstName={formData.firstName}
            lastName={formData.lastName}
            email={user.email || ''}
            onUpdate={updateFormData}
            onNext={handleNext}
          />
        )
      case 2:
        return (
          <RidingStyleStep
            selected={formData.ridingStyles}
            onUpdate={(ridingStyles) => updateFormData({ ridingStyles })}
            onNext={handleNext}
          />
        )
      case 3:
        return (
          <BrandPreferenceStep
            selected={formData.preferredBrands}
            onUpdate={(preferredBrands) => updateFormData({ preferredBrands })}
            onNext={handleNext}
          />
        )
      case 4:
        return (
          <ExperienceLevelStep
            selected={formData.experienceLevel}
            onUpdate={(experienceLevel) => updateFormData({ experienceLevel })}
            onNext={handleNext}
          />
        )
      case 5:
        return (
          <BudgetRangeStep
            selected={formData.budgetRange}
            onUpdate={(budgetRange) => updateFormData({ budgetRange })}
            onNext={handleNext}
          />
        )
      case 6:
        return (
          <InterestsStep
            selected={formData.interests}
            onUpdate={(interests) => updateFormData({ interests })}
            onNext={handleNext}
          />
        )
      case 7:
        return (
          <div className="bg-white rounded-xl shadow-xl p-8 text-center">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">
              You&apos;re all set!
            </h2>
            <p className="text-gray-600 mb-6">
              Let&apos;s start exploring bikes tailored to your preferences.
            </p>
            {error && (
              <div className="bg-white border border-gray-200 rounded-md p-4 mb-6">
                <p className="text-sm text-red-600">{error}</p>
              </div>
            )}
            <Button
              onClick={handleComplete}
              disabled={loading}
              size="lg"
              className="rounded-md"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Finishing up...
                </>
              ) : (
                'Go to Marketplace'
              )}
            </Button>
          </div>
        )
      default:
        return null
    }
  }

  return (
    <OnboardingLayout
      currentStep={currentStep}
      totalSteps={totalSteps}
      onBack={handleBack}
      showBack={currentStep > 1 && accountType === 'individual'}
    >
      {renderStep()}
    </OnboardingLayout>
  )
}

