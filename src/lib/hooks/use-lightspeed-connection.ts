/**
 * Lightspeed Connection Hook
 * 
 * Manages Lightspeed connection state, sync operations, and settings
 * for the frontend. Provides real-time status updates via polling.
 */

'use client'

import { useState, useEffect, useCallback } from 'react'
import type { 
  LightspeedConnection, 
  LightspeedSyncSettings,
  LightspeedConnectionState,
  SyncOption,
} from '@/lib/services/lightspeed/types'

interface UseLightspeedConnectionOptions {
  /** Polling interval in milliseconds (default: 30000 - 30 seconds) */
  pollInterval?: number
  /** Whether to auto-fetch on mount (default: true) */
  autoFetch?: boolean
}

interface LightspeedStatusResponse {
  isConnected: boolean
  connection: Omit<LightspeedConnection, 'access_token_encrypted' | 'refresh_token_encrypted' | 'oauth_state'> | null
  syncSettings: LightspeedSyncSettings | null
  accountInfo: {
    id: string
    name: string
  } | null
}

interface SyncResult {
  success: boolean
  message: string
  data?: {
    entitiesSynced: string[]
    recordsProcessed: number
    durationMs: number
    products: number
    orders: number
    customers: number
    shops: number
  }
  error?: string
}

export function useLightspeedConnection(options: UseLightspeedConnectionOptions = {}) {
  const { pollInterval = 30000, autoFetch = true } = options

  // State
  const [isConnected, setIsConnected] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isConnecting, setIsConnecting] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)
  const [isDisconnecting, setIsDisconnecting] = useState(false)
  const [connection, setConnection] = useState<LightspeedConnection | null>(null)
  const [syncSettings, setSyncSettings] = useState<LightspeedSyncSettings | null>(null)
  const [accountInfo, setAccountInfo] = useState<{ id: string; name: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [lastSync, setLastSync] = useState<Date | null>(null)

  // Sync options for UI
  const [syncOptions, setSyncOptions] = useState<SyncOption[]>([
    {
      id: 'products',
      title: 'Products',
      description: 'Sync your bicycle inventory and parts',
      enabled: true,
    },
    {
      id: 'orders',
      title: 'Orders',
      description: 'Import orders from Lightspeed POS',
      enabled: true,
    },
    {
      id: 'customers',
      title: 'Customers',
      description: 'Sync customer data and purchase history',
      enabled: false,
    },
    {
      id: 'inventory',
      title: 'Inventory',
      description: 'Sync stock levels across locations',
      enabled: true,
    },
  ])

  /**
   * Fetch connection status from API
   */
  const fetchStatus = useCallback(async () => {
    try {
      const response = await fetch('/api/lightspeed/status')
      
      if (!response.ok) {
        if (response.status === 401) {
          setIsConnected(false)
          setConnection(null)
          return
        }
        throw new Error('Failed to fetch status')
      }

      const data: LightspeedStatusResponse = await response.json()
      
      setIsConnected(data.isConnected)
      setConnection(data.connection as LightspeedConnection | null)
      setSyncSettings(data.syncSettings)
      setAccountInfo(data.accountInfo)
      setError(null)

      // Update last sync time
      if (data.connection?.last_sync_at) {
        setLastSync(new Date(data.connection.last_sync_at))
      }

      // Update sync options from settings
      if (data.syncSettings) {
        setSyncOptions(prev => prev.map(opt => ({
          ...opt,
          enabled: data.syncSettings![`sync_${opt.id}` as keyof LightspeedSyncSettings] as boolean ?? opt.enabled,
        })))
      }
    } catch (err) {
      console.error('Error fetching Lightspeed status:', err)
      setError(err instanceof Error ? err.message : 'Failed to fetch connection status')
    } finally {
      setIsLoading(false)
    }
  }, [])

  /**
   * Initiate OAuth connection
   */
  const connect = useCallback(() => {
    setIsConnecting(true)
    setError(null)
    
    // Redirect to OAuth initiation endpoint
    window.location.href = '/api/lightspeed/auth/initiate'
  }, [])

  /**
   * Disconnect from Lightspeed
   */
  const disconnect = useCallback(async () => {
    setIsDisconnecting(true)
    setError(null)

    try {
      const response = await fetch('/api/lightspeed/disconnect', {
        method: 'POST',
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to disconnect')
      }

      setIsConnected(false)
      setConnection(null)
      setSyncSettings(null)
      setAccountInfo(null)
      setLastSync(null)
    } catch (err) {
      console.error('Error disconnecting:', err)
      setError(err instanceof Error ? err.message : 'Failed to disconnect')
    } finally {
      setIsDisconnecting(false)
    }
  }, [])

  /**
   * Trigger manual sync
   */
  const sync = useCallback(async (): Promise<SyncResult> => {
    setIsSyncing(true)
    setError(null)

    try {
      const response = await fetch('/api/lightspeed/sync', {
        method: 'POST',
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Sync failed')
      }

      setLastSync(new Date())
      
      // Refresh status after sync
      await fetchStatus()

      return {
        success: true,
        message: data.message,
        data: data.data,
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Sync failed'
      setError(errorMessage)
      return {
        success: false,
        message: errorMessage,
        error: errorMessage,
      }
    } finally {
      setIsSyncing(false)
    }
  }, [fetchStatus])

  /**
   * Update sync settings
   */
  const updateSyncSettings = useCallback(async (
    settings: Partial<{
      sync_products: boolean
      sync_orders: boolean
      sync_customers: boolean
      sync_inventory: boolean
      auto_sync_enabled: boolean
      auto_sync_interval_minutes: number
      overwrite_local_changes: boolean
    }>
  ) => {
    try {
      const response = await fetch('/api/lightspeed/settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(settings),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to update settings')
      }

      setSyncSettings(data.settings)

      // Update sync options
      setSyncOptions(prev => prev.map(opt => {
        const key = `sync_${opt.id}` as keyof typeof settings
        return {
          ...opt,
          enabled: settings[key] !== undefined ? settings[key] as boolean : opt.enabled,
        }
      }))

      return { success: true }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to update settings'
      setError(errorMessage)
      return { success: false, error: errorMessage }
    }
  }, [])

  /**
   * Toggle a sync option
   */
  const toggleSyncOption = useCallback(async (optionId: SyncOption['id']) => {
    const option = syncOptions.find(o => o.id === optionId)
    if (!option) return

    const newEnabled = !option.enabled
    
    // Optimistically update UI
    setSyncOptions(prev => prev.map(opt =>
      opt.id === optionId ? { ...opt, enabled: newEnabled } : opt
    ))

    // Update on server
    const result = await updateSyncSettings({
      [`sync_${optionId}`]: newEnabled,
    })

    // Revert if failed
    if (!result.success) {
      setSyncOptions(prev => prev.map(opt =>
        opt.id === optionId ? { ...opt, enabled: !newEnabled } : opt
      ))
    }
  }, [syncOptions, updateSyncSettings])

  /**
   * Format last sync time for display
   */
  const formatLastSync = useCallback((date: Date) => {
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)

    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`

    const diffHours = Math.floor(diffMins / 60)
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`

    const diffDays = Math.floor(diffHours / 24)
    return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`
  }, [])

  // Initial fetch
  useEffect(() => {
    if (autoFetch) {
      fetchStatus()
    }
  }, [autoFetch, fetchStatus])

  // Handle OAuth callback params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const success = params.get('success')
    const errorParam = params.get('error')

    if (success === 'true') {
      setIsConnecting(false)
      fetchStatus()
      // Clean URL
      window.history.replaceState({}, '', window.location.pathname)
    } else if (errorParam) {
      setIsConnecting(false)
      setError(decodeURIComponent(errorParam))
      // Clean URL
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [fetchStatus])

  // Polling for status updates
  useEffect(() => {
    if (!isConnected || pollInterval <= 0) return

    const interval = setInterval(fetchStatus, pollInterval)
    return () => clearInterval(interval)
  }, [isConnected, pollInterval, fetchStatus])

  // Return state and actions
  const state: LightspeedConnectionState = {
    isConnected,
    isLoading,
    isConnecting,
    isSyncing,
    connection,
    syncSettings,
    error,
    lastSync,
    accountInfo,
  }

  return {
    // State
    ...state,
    isDisconnecting,
    syncOptions,

    // Actions
    connect,
    disconnect,
    sync,
    fetchStatus,
    updateSyncSettings,
    toggleSyncOption,

    // Helpers
    formatLastSync,
  }
}

