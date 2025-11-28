/**
 * Sync Status Hook
 * 
 * Polls for active inventory sync operations
 */

'use client'

import { useState, useEffect } from 'react'

export function useSyncStatus() {
  const [isSyncing, setIsSyncing] = useState(false)
  const [syncType, setSyncType] = useState<string | null>(null)
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null)

  useEffect(() => {
    let intervalId: NodeJS.Timeout

    const checkSyncStatus = async () => {
      try {
        const response = await fetch('/api/lightspeed/sync-status')
        
        if (response.ok) {
          const data = await response.json()
          setIsSyncing(data.isSyncing || false)
          setSyncType(data.sync?.sync_type || null)
          setLastSyncAt(data.lastSyncAt || null)
        }
      } catch (error) {
        // Silently fail - don't disrupt UI
        console.debug('Error checking sync status:', error)
      }
    }

    // Check immediately
    checkSyncStatus()

    // Poll every 5 seconds when syncing, every 30 seconds otherwise
    const getInterval = () => (isSyncing ? 5000 : 30000)
    
    const setupInterval = () => {
      intervalId = setInterval(checkSyncStatus, getInterval())
    }

    setupInterval()

    return () => {
      if (intervalId) {
        clearInterval(intervalId)
      }
    }
  }, [isSyncing])

  // Format last sync time
  const formatLastSync = (dateString: string | null): string => {
    if (!dateString) return 'Never'
    
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)

    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`

    const diffHours = Math.floor(diffMins / 60)
    if (diffHours < 24) return `${diffHours}h ago`

    const diffDays = Math.floor(diffHours / 24)
    return `${diffDays}d ago`
  }

  return { isSyncing, syncType, lastSyncAt, formattedLastSync: formatLastSync(lastSyncAt) }
}

