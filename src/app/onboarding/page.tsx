'use client'

import React, { useState, useEffect, Suspense } from 'react'
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

// Force dynamic rendering
export const dynamic = 'force-dynamic';

function OnboardingPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user } = useAuth()
  const supabase = createClient()

  const [accountType, setAccountType] = useState<'individual' | 'bicycle_store'>('individual')
  const [currentStep, setCurrentStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isLoadingProfile, setIsLoadingProfile] = useState(true)

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
      router.push('/marketplace')
      return
    }

    // Check if user has already completed onboarding and get account type
    const checkOnboardingStatus = async () => {
      try {
        const { data: profile, error: profileError } = await supabase
          .from('users')
          .select('onboarding_completed, account_type')
          .eq('user_id', user.id)
          .single()

        if (profileError) {
          console.error('Error fetching profile:', profileError)
        }

        // Redirect if onboarding already completed
        if (profile?.onboarding_completed === true) {
          console.log('[ONBOARDING] Already completed, redirecting to marketplace')
          router.push('/marketplace')
          return
        }

        // Set account type from database or URL parameter
        const dbAccountType = profile?.account_type
        const urlAccountType = searchParams.get('type')
        
        if (dbAccountType === 'bicycle_store') {
          setAccountType('bicycle_store')
        } else if (urlAccountType === 'bicycle_store') {
          setAccountType('bicycle_store')
        } else {
          setAccountType('individual')
        }

        setIsLoadingProfile(false)
      } catch (err) {
        console.error('Error in onboarding check:', err)
        setIsLoadingProfile(false)
      }
    }

    checkOnboardingStatus()
  }, [user, router, supabase, searchParams])

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

  if (!user || isLoadingProfile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100">
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
          <div className="bg-white rounded-xl shadow-xl p-5 sm:p-6 md:p-8 text-center">
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-3 sm:mb-4">
              You&apos;re all set!
            </h2>
            <p className="text-sm sm:text-base text-gray-600 mb-5 sm:mb-6">
              Let&apos;s start exploring bikes tailored to your preferences.
            </p>
            {error && (
              <div className="bg-white border border-gray-200 rounded-md p-3 sm:p-4 mb-5 sm:mb-6">
                <p className="text-xs sm:text-sm text-red-600">{error}</p>
              </div>
            )}
            <Button
              onClick={handleComplete}
              disabled={loading}
              size="lg"
              className="rounded-md w-full sm:w-auto sm:px-8 h-11 sm:h-12 text-sm sm:text-base font-medium"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 sm:h-5 sm:w-5 animate-spin" />
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

// Wrap with Suspense for useSearchParams
export default function OnboardingPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-gray-400">Loading...</div>
      </div>
    }>
      <OnboardingPageContent />
    </Suspense>
  );
}

