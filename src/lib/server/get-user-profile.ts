import { createClient } from '@/lib/supabase/server'
import { cache } from 'react'

export interface ServerProfile {
  logo_url?: string | null
  business_name?: string | null
  name?: string | null
  first_name?: string | null
  last_name?: string | null
  account_type?: string | null
  bicycle_store?: boolean | null
  opening_hours?: any | null
  phone?: string | null
  store_type?: string | null
  address?: string | null
  website?: string | null
  email_notifications?: boolean | null
  order_alerts?: boolean | null
  marketing_emails?: boolean | null
  inventory_alerts?: boolean | null
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
      .select('logo_url, business_name, name, first_name, last_name, account_type, bicycle_store, opening_hours, phone, store_type, address, website, email_notifications, order_alerts, marketing_emails, inventory_alerts')
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

