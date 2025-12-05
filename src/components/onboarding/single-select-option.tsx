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
          "flex items-start space-x-2.5 sm:space-x-3 p-3 sm:p-4 rounded-md border-2 transition-all cursor-pointer active:scale-[0.98] hover:bg-gray-50 touch-manipulation min-h-[52px] sm:min-h-[56px]",
          checked
            ? "border-blue-500 bg-blue-50"
            : "border-gray-200 bg-white"
        )}
      >
        <RadioGroupItem value={value} id={id} className="mt-0.5 sm:mt-1 shrink-0" />
        <Label
          htmlFor={id}
          className="cursor-pointer flex-1"
        >
          <div className={cn(
            "flex items-center gap-2 text-sm sm:text-base font-medium mb-0.5 sm:mb-1 leading-snug",
            checked ? "text-blue-700" : "text-gray-700"
          )}>
            {icon && <span className="text-gray-600 shrink-0">{icon}</span>}
            <span className="break-words">{label}</span>
          </div>
          {description && (
            <p className="text-xs sm:text-sm text-gray-500 leading-relaxed">{description}</p>
          )}
        </Label>
      </div>
    </motion.div>
  )
}



