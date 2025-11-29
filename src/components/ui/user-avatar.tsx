import * as React from 'react'
import { cn } from '@/lib/utils'

interface UserAvatarProps {
  name: string
  size?: 'sm' | 'default' | 'lg'
  className?: string
}

function getInitials(name: string): string {
  if (!name || name.trim() === '') {
    return '?'
  }

  const parts = name.trim().split(/\s+/)
  
  if (parts.length === 1) {
    // Single word: take first two characters
    return parts[0].substring(0, 2).toUpperCase()
  }
  
  // Multiple words: take first character of first two words
  return (parts[0][0] + parts[1][0]).toUpperCase()
}

export function UserAvatar({ name, size = 'default', className }: UserAvatarProps) {
  const initials = getInitials(name)

  const sizeClasses = {
    sm: 'h-8 w-8 text-xs',
    default: 'h-10 w-10 text-sm',
    lg: 'h-12 w-12 text-base',
  }

  return (
    <div
      className={cn(
        'flex items-center justify-center rounded-full bg-white border-2 border-gray-200 font-semibold text-gray-700 flex-shrink-0',
        sizeClasses[size],
        className
      )}
      title={name}
    >
      {initials}
    </div>
  )
}

