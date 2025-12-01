'use client'

import React from 'react'
import { RadioGroupItem } from '@/components/ui/radio-group'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { motion } from 'framer-motion'

interface SingleSelectOptionProps {
  id: string
  value: string
  label: string
  description?: string
  checked: boolean
  icon?: React.ReactNode
}

export function SingleSelectOption({
  id,
  value,
  label,
  description,
  checked,
  icon,
}: SingleSelectOptionProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <div
        className={cn(
          "flex items-start space-x-3 p-4 rounded-md border-2 transition-all cursor-pointer hover:bg-gray-50",
          checked
            ? "border-blue-500 bg-blue-50"
            : "border-gray-200 bg-white"
        )}
      >
        <RadioGroupItem value={value} id={id} className="mt-1" />
        <Label
          htmlFor={id}
          className="cursor-pointer flex-1"
        >
          <div className={cn(
            "flex items-center gap-2 text-base font-medium mb-1",
            checked ? "text-blue-700" : "text-gray-700"
          )}>
            {icon && <span className="text-gray-600">{icon}</span>}
            {label}
          </div>
          {description && (
            <p className="text-sm text-gray-500">{description}</p>
          )}
        </Label>
      </div>
    </motion.div>
  )
}

