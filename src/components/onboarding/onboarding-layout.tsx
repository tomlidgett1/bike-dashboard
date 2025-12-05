'use client'

import React from 'react'
import { motion } from 'framer-motion'
import { Bike, ChevronLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import Image from 'next/image'

interface OnboardingLayoutProps {
  children: React.ReactNode
  currentStep: number
  totalSteps: number
  onBack?: () => void
  showBack?: boolean
}

export function OnboardingLayout({
  children,
  currentStep,
  totalSteps,
  onBack,
  showBack = true,
}: OnboardingLayoutProps) {
  const progress = (currentStep / totalSteps) * 100

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 p-3 sm:p-4 md:p-6">
      <div className="w-full max-w-2xl">
        {/* Logo/Brand */}
        <div className="text-center mb-4 sm:mb-6 md:mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 sm:w-14 sm:h-14 md:w-16 md:h-16 bg-white rounded-xl sm:rounded-2xl shadow-lg mb-2 sm:mb-3 md:mb-4">
            <Bike className="w-6 h-6 sm:w-7 sm:h-7 md:w-8 md:h-8 text-gray-900" />
          </div>
          <div className="flex items-center justify-center">
            <Image 
              src="/yj.svg" 
              alt="Yellow Jersey" 
              width={300} 
              height={60}
              className="h-10 sm:h-12 md:h-16 w-auto"
            />
          </div>
        </div>

        {/* Progress Bar */}
        <div className="mb-4 sm:mb-6 md:mb-8">
          <div className="flex items-center justify-between mb-1.5 sm:mb-2">
            <p className="text-xs sm:text-sm font-medium text-gray-600">
              Step {currentStep} of {totalSteps}
            </p>
            <p className="text-xs sm:text-sm font-medium text-gray-600">
              {Math.round(progress)}% complete
            </p>
          </div>
          <div className="w-full h-1.5 sm:h-2 bg-gray-200 rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-gradient-to-r from-blue-500 to-blue-600"
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.5, ease: [0.04, 0.62, 0.23, 0.98] }}
            />
          </div>
        </div>

        {/* Back Button */}
        {showBack && onBack && currentStep > 1 && (
          <div className="mb-3 sm:mb-4">
            <Button
              variant="ghost"
              onClick={onBack}
              className="rounded-md -ml-2 h-9 px-3 text-sm"
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Back
            </Button>
          </div>
        )}

        {/* Main Content */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.04, 0.62, 0.23, 0.98] }}
        >
          {children}
        </motion.div>
      </div>
    </div>
  )
}



