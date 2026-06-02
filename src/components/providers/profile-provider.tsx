'use client'

import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import type { User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from './auth-provider'
import type { ServerProfile } from '@/lib/server/get-user-profile'

function getGooglePictureFromUser(user: User): string | undefined {
  const hasGoogle = user.identities?.some((i) => i.provider === 'google')
  if (!hasGoogle) return undefined
  const meta = user.user_metadata || {}
  const raw = meta.avatar_url ?? meta.picture
  return typeof raw === 'string' && raw.trim().length > 0 ? raw.trim() : undefined
}

function shouldSyncGoogleLogoToDb( currentLogo: string | undefined ): boolean {
  if (!currentLogo) return true
  return currentLogo.includes('googleusercontent.com')
}

export interface DayHours {
  open: string
  close: string
  closed: boolean
}

export interface OpeningHours {
  monday: DayHours
  tuesday: DayHours
  wednesday: DayHours
  thursday: DayHours
  friday: DayHours
  saturday: DayHours
  sunday: DayHours
}

export interface UserPreferences {
  riding_styles?: string[]
  preferred_brands?: string[]
  experience_level?: string
  budget_range?: string
  interests?: string[]
}

export interface SocialLinks {
  instagram?: string
  facebook?: string
  strava?: string
  twitter?: string
  website?: string
}

export interface ShippingAddress {
  name: string
  phone: string
  line1: string
  line2?: string
  city: string
  state: string
  postal_code: string
  country: string
}

export interface UserProfile {
  id?: string
  user_id: string
  name: string
  email: string
  phone: string
  first_name: string
  last_name: string
  business_name: string
  store_type: string
  address: string
  website: string
  logo_url?: string | null
  opening_hours?: OpeningHours
  account_type: string
  bicycle_store: boolean
  uber_notification_phones?: string[]
  preferences: UserPreferences
  onboarding_completed: boolean
  email_notifications: boolean
  order_alerts: boolean
  inventory_alerts: boolean
  marketing_emails: boolean
  // Seller profile fields
  bio?: string
  cover_image_url?: string
  social_links?: SocialLinks
  seller_display_name?: string
  shipping_address?: ShippingAddress | null
  created_at?: string
  updated_at?: string
}

interface ProfileContextType {
  profile: UserProfile | null
  loading: boolean
  saving: boolean
  isFirstTime: boolean
  saveProfile: (profileData: Partial<UserProfile>) => Promise<{ success: boolean; error?: string; data?: UserProfile }>
  refreshProfile: () => Promise<void>
}

const ProfileContext = createContext<ProfileContextType | undefined>(undefined)

interface ProfileProviderProps {
  serverProfile: ServerProfile | null
  children: React.ReactNode
}

export function ProfileProvider({ serverProfile, children }: ProfileProviderProps) {
  const { user } = useAuth()
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [isFirstTime, setIsFirstTime] = useState(false)

  const fetchFullProfile = useCallback(async () => {
    if (!user) return

    setLoading(true)
    try {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('user_id', user.id)
        .single()

      if (error) {
        if (error.code === 'PGRST116') {
          // No rows returned - first time user
          setIsFirstTime(true)
          setProfile({
            user_id: user.id,
            name: '',
            email: user.email || '',
            phone: '',
            first_name: '',
            last_name: '',
            business_name: '',
            store_type: '',
            address: '',
            website: '',
            logo_url: getGooglePictureFromUser(user),
            account_type: 'individual',
            bicycle_store: false,
            uber_notification_phones: [],
            preferences: {},
            onboarding_completed: false,
            email_notifications: true,
            order_alerts: true,
            inventory_alerts: true,
            marketing_emails: false,
          })
        }
      } else {
        setIsFirstTime(false)
        setProfile(data)
      }
    } catch (error) {
      console.error('Error fetching profile:', error)
    } finally {
      setLoading(false)
    }
  }, [user])

  // Track if we've already initialized from server profile
  const [initializedFromServer, setInitializedFromServer] = useState(false)

  // Initialize with server profile data - NO duplicate fetches
  useEffect(() => {
    if (serverProfile && user && !initializedFromServer) {
      // Use account_type from serverProfile if available, otherwise infer from business_name
      const hasBusinessName = serverProfile.business_name && serverProfile.business_name.trim().length > 0;
      const accountType = serverProfile.account_type || (hasBusinessName ? 'bicycle_store' : 'individual');
      const googlePicture = getGooglePictureFromUser(user)
      
      // We have server data - use it directly WITHOUT refetching
      // Server already fetched with proper caching, no need to hit DB again
      setProfile({
        user_id: user.id,
        name: serverProfile.name || '',
        email: user.email || '',
        phone: serverProfile.phone || '',
        first_name: serverProfile.first_name || '',
        last_name: serverProfile.last_name || '',
        business_name: serverProfile.business_name || '',
        store_type: serverProfile.store_type || '',
        address: serverProfile.address || '',
        website: serverProfile.website || '',
        logo_url: serverProfile.logo_url || googlePicture || undefined,
        account_type: accountType,
        bicycle_store: serverProfile.bicycle_store ?? false,
        uber_notification_phones: serverProfile.uber_notification_phones ?? [],
        preferences: {},
        onboarding_completed: false,
        email_notifications: serverProfile.email_notifications ?? true,
        order_alerts: serverProfile.order_alerts ?? true,
        inventory_alerts: serverProfile.inventory_alerts ?? true,
        marketing_emails: serverProfile.marketing_emails ?? false,
        shipping_address: serverProfile.shipping_address ?? null,
      })
      setInitializedFromServer(true)
      // DON'T call fetchFullProfile() - server data is sufficient for display
    } else if (user && !serverProfile && !initializedFromServer) {
      // No server profile available, fetch from client
      fetchFullProfile()
      setInitializedFromServer(true)
    }
  }, [user, serverProfile, fetchFullProfile, initializedFromServer])

  // Persist Google profile photo to users.logo_url when the DB row is missing it or still has a Google URL.
  useEffect(() => {
    if (!user || isFirstTime) return
    const googleUrl = getGooglePictureFromUser(user)
    if (!googleUrl) return

    let cancelled = false

    ;(async () => {
      const supabase = createClient()
      const { data: row, error: fetchError } = await supabase
        .from('users')
        .select('logo_url')
        .eq('user_id', user.id)
        .maybeSingle()

      if (cancelled || fetchError || !row) return

      const dbLogo = row.logo_url || ''
      if (!shouldSyncGoogleLogoToDb(dbLogo)) return
      if (dbLogo === googleUrl) return

      // Only overwrite if DB still has a Google URL or no logo — prevents
      // a race condition where the user saves a custom logo between our
      // SELECT above and this UPDATE.
      const { data: updated, error: updateError } = await supabase
        .from('users')
        .update({
          logo_url: googleUrl,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', user.id)
        .or('logo_url.is.null,logo_url.eq.,logo_url.ilike.%googleusercontent.com%')
        .select()
        .single()

      if (cancelled || updateError || !updated) return
      setProfile(updated)
    })()

    return () => {
      cancelled = true
    }
  }, [user, isFirstTime])

  const saveProfile = async (profileData: Partial<UserProfile>) => {
    if (!user) return { success: false, error: 'No user logged in' }

    setSaving(true)
    try {
      const supabase = createClient()
      const dataToSave = {
        user_id: user.id,
        ...profileData,
        updated_at: new Date().toISOString(),
      }

      let result

      if (isFirstTime) {
        // Insert new profile
        result = await supabase
          .from('users')
          .insert([dataToSave])
          .select()
          .single()
      } else {
        // Update existing profile
        result = await supabase
          .from('users')
          .update(dataToSave)
          .eq('user_id', user.id)
          .select()
          .single()
      }

      if (result.error) {
        console.error('Error saving profile:', result.error)
        
        let errorMessage = result.error.message || 'Failed to save profile'
        
        if (result.error.code === '42P01') {
          errorMessage = 'Database table not found. Please run the SQL migration.'
        } else if (result.error.code === '23505') {
          errorMessage = 'A profile already exists for this user.'
        } else if (result.error.code === '42703') {
          errorMessage = 'Database column not found. Please run: supabase db push'
        } else if (result.error.message?.includes('opening_hours')) {
          errorMessage = 'Opening hours column not found. Please run: supabase db push'
        }
        
        return { success: false, error: errorMessage }
      }

      setProfile(result.data)
      setIsFirstTime(false)
      return { success: true, data: result.data }
    } catch (error: unknown) {
      console.error('Error saving profile:', error)
      const errorMessage = error instanceof Error
        ? error.message
        : 'Failed to save profile. Please try again.'
      return { success: false, error: errorMessage }
    } finally {
      setSaving(false)
    }
  }

  return (
    <ProfileContext.Provider
      value={{
        profile,
        loading,
        saving,
        isFirstTime,
        saveProfile,
        refreshProfile: fetchFullProfile,
      }}
    >
      {children}
    </ProfileContext.Provider>
  )
}

export function useUserProfile() {
  const context = useContext(ProfileContext)
  if (context === undefined) {
    throw new Error('useUserProfile must be used within ProfileProvider')
  }
  return context
}
