'use client'

import { installGlobalTapHaptics } from '@/lib/haptics'

// Install as early as possible on the client, matching Nest V3's main.tsx pattern.
installGlobalTapHaptics()

export function HapticsBootstrap() {
  return null
}
