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
      <CardHeader className="space-y-2 pb-6">
        <CardTitle className="text-2xl font-bold text-gray-900">
          {title}
        </CardTitle>
        {description && (
          <CardDescription className="text-base text-gray-600">
            {description}
          </CardDescription>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {children}
      </CardContent>
    </Card>
  )
}

