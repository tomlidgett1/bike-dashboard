import { createClient } from '@/lib/supabase/server'
import { cache } from 'react'

export interface ServerShippingAddress {
  name: string
  phone: string
  line1: string
  line2?: string
  city: string
  state: string
  postal_code: string
  country: string
}

export interface ServerProfile {
  logo_url?: string | null
  business_name?: string | null
  name?: string | null
  first_name?: string | null
  last_name?: string | null
  account_type?: string | null
  bicycle_store?: boolean | null
  uber_notification_phones?: string[] | null
  opening_hours?: Record<string, unknown> | null
  phone?: string | null
  store_type?: string | null
  address?: string | null
  website?: string | null
  email_notifications?: boolean | null
  order_alerts?: boolean | null
  marketing_emails?: boolean | null
  inventory_alerts?: boolean | null
  shipping_address?: ServerShippingAddress | null
  bio?: string | null
  preferences?: { store_setup_completed?: boolean } | null
}

/**
 * Server-side function to fetch user profile
 * Uses React cache() for request deduplication
 */
export const getUserProfile = cache(async (): Promise<ServerProfile | null> => {
  try {
    const supabase = await createClient()
    
    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return null
    }
    
    // Fetch user profile with only the fields needed for UI
    const { data, error } = await supabase
      .from('users')
      .select('logo_url, business_name, name, first_name, last_name, account_type, bicycle_store, uber_notification_phones, opening_hours, phone, store_type, address, website, email_notifications, order_alerts, marketing_emails, inventory_alerts, shipping_address, bio, preferences')
      .eq('user_id', user.id)
      .single()
    
    if (error) {
      // User might not have a profile yet
      return null
    }
    
    return data
  } catch (error) {
    console.error('Error fetching server profile:', error)
    return null
  }
})
