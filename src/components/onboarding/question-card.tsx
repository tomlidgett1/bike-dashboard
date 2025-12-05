'use client'

import React from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

interface QuestionCardProps {
  title: string
  description?: string
  children: React.ReactNode
}

export function QuestionCard({ title, description, children }: QuestionCardProps) {
  return (
    <Card className="bg-white shadow-xl rounded-xl border-0">
      <CardHeader className="space-y-1.5 sm:space-y-2 pb-4 sm:pb-5 md:pb-6 px-4 sm:px-6 pt-4 sm:pt-6">
        <CardTitle className="text-lg sm:text-xl md:text-2xl font-bold text-gray-900 leading-tight">
          {title}
        </CardTitle>
        {description && (
          <CardDescription className="text-sm sm:text-base text-gray-600 leading-relaxed">
            {description}
          </CardDescription>
        )}
      </CardHeader>
      <CardContent className="space-y-3 sm:space-y-4 px-4 sm:px-6 pb-4 sm:pb-6">
        {children}
      </CardContent>
    </Card>
  )
}



