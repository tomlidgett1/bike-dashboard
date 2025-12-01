'use client'

import React from 'react'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { motion } from 'framer-motion'

interface MultiSelectOptionProps {
  id: string
  label: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  icon?: React.ReactNode
}

export function MultiSelectOption({
  id,
  label,
  checked,
  onCheckedChange,
  icon,
}: MultiSelectOptionProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <div
        className={cn(
          "flex items-center space-x-3 p-4 rounded-md border-2 transition-all cursor-pointer hover:bg-gray-50",
          checked
            ? "border-blue-500 bg-blue-50"
            : "border-gray-200 bg-white"
        )}
        onClick={() => onCheckedChange(!checked)}
      >
        <Checkbox
          id={id}
          checked={checked}
          onCheckedChange={onCheckedChange}
          className="rounded-md"
        />
        <Label
          htmlFor={id}
          className={cn(
            "flex items-center gap-2 cursor-pointer text-base font-medium flex-1",
            checked ? "text-blue-700" : "text-gray-700"
          )}
        >
          {icon && <span className="text-gray-600">{icon}</span>}
          {label}
        </Label>
      </div>
    </motion.div>
  )
}

