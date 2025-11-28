import { createClient } from '@/lib/supabase/server'
import { cache } from 'react'

export interface ServerProfile {
  logo_url?: string | null
  business_name?: string | null
  name?: string | null
  opening_hours?: any | null
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
      .select('logo_url, business_name, name, opening_hours')
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

