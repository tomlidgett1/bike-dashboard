'use client'

import * as React from 'react'
import { Suspense } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import {
  User,
  Mail,
  Bell,
  Save,
  Check,
  Loader2,
  Bike,
  DollarSign,
  Star,
  ShoppingBag,
  Settings as SettingsIcon,
  Store,
  Camera,
  MapPin,
  Instagram,
  Facebook,
  ExternalLink,
  ImageIcon,
  Eye,
  ChevronRight,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { useUserProfile } from '@/lib/hooks/use-user-profile'
import { useAuth } from '@/components/providers/auth-provider'
import { MarketplaceLayout } from '@/components/layout/marketplace-layout'
import { MarketplaceHeader } from '@/components/marketplace/marketplace-header'

// Strava icon component (not in lucide)
function StravaIcon({ className }: { className?: string }) {
  return (
    <svg 
      viewBox="0 0 24 24" 
      fill="currentColor" 
      className={className}
    >
      <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169" />
    </svg>
  );
}

// Force dynamic rendering to avoid useSearchParams SSR issues
export const dynamic = 'force-dynamic'

export default function MarketplaceSettingsPage() {
  const { user } = useAuth()
  const router = useRouter()
  const [saved, setSaved] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [formReady, setFormReady] = React.useState(false)

  const { profile, loading: profileLoading, saving, saveProfile } = useUserProfile()

  // Form state
  const [formData, setFormData] = React.useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    emailNotifications: true,
    orderAlerts: true,
    marketingEmails: false,
    // Seller profile fields
    sellerDisplayName: '',
    bio: '',
    location: '',
    logoUrl: '',
    socialInstagram: '',
    socialFacebook: '',
    socialStrava: '',
    socialWebsite: '',
  })

  // Redirect bike stores to their settings page (before rendering content)
  React.useEffect(() => {
    if (!profileLoading && profile) {
      const isBikeStore = profile.account_type === 'bicycle_store' && profile.bicycle_store === true
      if (isBikeStore) {
        router.replace('/settings')
      }
    }
  }, [profile, profileLoading, router])

  // Load profile data when available - set form ready AFTER data is loaded
  React.useEffect(() => {
    if (profile && !formReady) {
      setFormData({
        firstName: profile.first_name || '',
        lastName: profile.last_name || '',
        email: profile.email || '',
        phone: profile.phone || '',
        emailNotifications: profile.email_notifications ?? true,
        orderAlerts: profile.order_alerts ?? true,
        marketingEmails: profile.marketing_emails ?? false,
        // Seller profile fields
        sellerDisplayName: profile.seller_display_name || '',
        bio: profile.bio || '',
        location: profile.address || '',
        logoUrl: profile.logo_url || '',
        socialInstagram: profile.social_links?.instagram || '',
        socialFacebook: profile.social_links?.facebook || '',
        socialStrava: profile.social_links?.strava || '',
        socialWebsite: profile.social_links?.website || '',
      })
      setFormReady(true)
    }
  }, [profile, formReady])

  const handleSave = async () => {
    try {
      setError(null)
      setSaved(false)

      await saveProfile({
        first_name: formData.firstName,
        last_name: formData.lastName,
        name: `${formData.firstName} ${formData.lastName}`.trim(),
        phone: formData.phone,
        email_notifications: formData.emailNotifications,
        order_alerts: formData.orderAlerts,
        marketing_emails: formData.marketingEmails,
        // Seller profile fields
        seller_display_name: formData.sellerDisplayName,
        bio: formData.bio,
        address: formData.location,
        logo_url: formData.logoUrl,
        social_links: {
          instagram: formData.socialInstagram || undefined,
          facebook: formData.socialFacebook || undefined,
          strava: formData.socialStrava || undefined,
          website: formData.socialWebsite || undefined,
        },
      })

      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err) {
      console.error('Error saving settings:', err)
      setError(err instanceof Error ? err.message : 'Failed to save settings')
    }
  }

  const hasChanges =
    formData.firstName !== (profile?.first_name || '') ||
    formData.lastName !== (profile?.last_name || '') ||
    formData.phone !== (profile?.phone || '') ||
    formData.emailNotifications !== (profile?.email_notifications ?? true) ||
    formData.orderAlerts !== (profile?.order_alerts ?? true) ||
    formData.marketingEmails !== (profile?.marketing_emails ?? false) ||
    // Seller profile changes
    formData.sellerDisplayName !== (profile?.seller_display_name || '') ||
    formData.bio !== (profile?.bio || '') ||
    formData.location !== (profile?.address || '') ||
    formData.logoUrl !== (profile?.logo_url || '') ||
    formData.socialInstagram !== (profile?.social_links?.instagram || '') ||
    formData.socialFacebook !== (profile?.social_links?.facebook || '') ||
    formData.socialStrava !== (profile?.social_links?.strava || '') ||
    formData.socialWebsite !== (profile?.social_links?.website || '')

  // Show loading until BOTH profile is loaded AND form data is populated
  if (profileLoading || !formReady) {
    return (
      <>
        <MarketplaceHeader compactSearchOnMobile />
        <MarketplaceLayout>
          <div className="min-h-screen bg-gray-50 pt-16 sm:pt-16 pb-44 sm:pb-8">
            <div className="flex items-center justify-center py-24">
              <Loader2 className="h-8 w-8 text-gray-400 animate-spin" />
            </div>
          </div>
        </MarketplaceLayout>
      </>
    )
  }

  // Get preferences for display
  const preferences = profile?.preferences || {}
  const ridingStyles = preferences.riding_styles || []
  const preferredBrands = preferences.preferred_brands || []
  const experienceLevel = preferences.experience_level || 'Not set'
  const budgetRange = preferences.budget_range || 'Not set'
  const interests = preferences.interests || []

  // Get display name for preview
  const displayName = formData.sellerDisplayName || 
    `${formData.firstName} ${formData.lastName}`.trim() || 
    'Your Name'

  return (
    <>
      <MarketplaceHeader compactSearchOnMobile />

      <MarketplaceLayout>
        <div className="min-h-screen bg-gray-50 pt-16 sm:pt-16 pb-44 sm:pb-8">
          {/* Page Header */}
          <div className="border-b border-gray-200 bg-white">
            <div className="max-w-[1920px] mx-auto px-4 sm:px-6 py-4 sm:py-6">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                  <div className="hidden sm:flex items-center justify-center w-12 h-12 rounded-md bg-gray-100 flex-shrink-0">
                    <SettingsIcon className="h-6 w-6 text-gray-700" />
                  </div>
                  <div className="min-w-0">
                    <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Account Settings</h1>
                    <p className="text-xs sm:text-sm text-gray-600 hidden sm:block">
                      Manage your profile and preferences
                    </p>
                  </div>
                </div>
                {/* View Profile Button */}
                {user?.id && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-md flex-shrink-0"
                    onClick={() => router.push(`/marketplace/store/${user.id}`)}
                  >
                    <Eye className="h-4 w-4 sm:mr-2" />
                    <span className="hidden sm:inline">View Profile</span>
                  </Button>
                )}
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="max-w-[1920px] mx-auto px-4 sm:px-6 py-4 sm:py-8 space-y-4 sm:space-y-6">
            
            {/* Seller Profile Section */}
            <Card className="bg-white rounded-md shadow-sm overflow-hidden">
              <CardHeader className="px-4 sm:px-6 py-4 sm:py-6">
                <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                  <Store className="h-5 w-5" />
                  Seller Profile
                </CardTitle>
                <CardDescription className="text-xs sm:text-sm">
                  Customise how your profile appears to other users
                </CardDescription>
              </CardHeader>
              <CardContent className="px-4 sm:px-6 pb-4 sm:pb-6 space-y-5 sm:space-y-6">
                {/* Profile Photo Preview */}
                <div className="flex items-center gap-3 sm:gap-4">
                  <div className="h-16 w-16 sm:h-20 sm:w-20 rounded-full border-2 border-gray-200 bg-gray-100 overflow-hidden flex-shrink-0">
                    {formData.logoUrl ? (
                      <Image
                        src={formData.logoUrl}
                        alt="Profile"
                        width={80}
                        height={80}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center bg-gradient-to-br from-gray-100 to-gray-200">
                        <span className="text-xl sm:text-2xl font-bold text-gray-400">
                          {displayName.charAt(0).toUpperCase()}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-base sm:text-lg font-semibold text-gray-900 truncate">{displayName}</p>
                    {formData.location && (
                      <p className="text-xs sm:text-sm text-gray-500 flex items-center gap-1">
                        <MapPin className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                        {formData.location}
                      </p>
                    )}
                  </div>
                </div>

                <Separator />

                {/* Display Name */}
                <div className="space-y-2">
                  <Label htmlFor="sellerDisplayName" className="text-sm">Display Name</Label>
                  <Input
                    id="sellerDisplayName"
                    value={formData.sellerDisplayName}
                    onChange={(e) =>
                      setFormData({ ...formData, sellerDisplayName: e.target.value })
                    }
                    placeholder="e.g. John's Bikes, MTB Enthusiast"
                    className="rounded-md"
                  />
                  <p className="text-xs text-gray-500">
                    Custom name for your seller profile. Leave blank to use your full name.
                  </p>
                </div>

                {/* Bio */}
                <div className="space-y-2">
                  <Label htmlFor="bio" className="text-sm">Bio</Label>
                  <Textarea
                    id="bio"
                    value={formData.bio}
                    onChange={(e) =>
                      setFormData({ ...formData, bio: e.target.value })
                    }
                    placeholder="Tell other cyclists about yourself..."
                    className="rounded-md min-h-[100px] resize-none"
                    maxLength={500}
                  />
                  <p className="text-xs text-gray-500 text-right">
                    {formData.bio.length}/500
                  </p>
                </div>

                {/* Location */}
                <div className="space-y-2">
                  <Label htmlFor="location" className="text-sm">Location</Label>
                  <div className="relative">
                    <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                      id="location"
                      value={formData.location}
                      onChange={(e) =>
                        setFormData({ ...formData, location: e.target.value })
                      }
                      placeholder="e.g. Sydney, NSW"
                      className="rounded-md pl-10"
                    />
                  </div>
                </div>

                {/* Profile Image URL */}
                <div className="space-y-2">
                  <Label htmlFor="logoUrl" className="text-sm">Profile Photo URL</Label>
                  <div className="relative">
                    <Camera className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                      id="logoUrl"
                      value={formData.logoUrl}
                      onChange={(e) =>
                        setFormData({ ...formData, logoUrl: e.target.value })
                      }
                      placeholder="https://example.com/photo.jpg"
                      className="rounded-md pl-10"
                    />
                  </div>
                  <p className="text-xs text-gray-500">
                    Paste a URL to your profile photo
                  </p>
                </div>

                <Separator />

                {/* Social Links */}
                <div className="space-y-3 sm:space-y-4">
                  <Label className="text-sm font-medium">Social Links</Label>
                  
                  <div className="space-y-3 sm:grid sm:grid-cols-2 sm:gap-4 sm:space-y-0">
                    {/* Instagram */}
                    <div className="space-y-1.5">
                      <Label htmlFor="socialInstagram" className="text-xs flex items-center gap-1.5 text-gray-600">
                        <Instagram className="h-3.5 w-3.5" />
                        Instagram
                      </Label>
                      <Input
                        id="socialInstagram"
                        value={formData.socialInstagram}
                        onChange={(e) =>
                          setFormData({ ...formData, socialInstagram: e.target.value })
                        }
                        placeholder="@yourusername"
                        className="rounded-md h-10"
                      />
                    </div>

                    {/* Facebook */}
                    <div className="space-y-1.5">
                      <Label htmlFor="socialFacebook" className="text-xs flex items-center gap-1.5 text-gray-600">
                        <Facebook className="h-3.5 w-3.5" />
                        Facebook
                      </Label>
                      <Input
                        id="socialFacebook"
                        value={formData.socialFacebook}
                        onChange={(e) =>
                          setFormData({ ...formData, socialFacebook: e.target.value })
                        }
                        placeholder="Your page URL"
                        className="rounded-md h-10"
                      />
                    </div>

                    {/* Strava */}
                    <div className="space-y-1.5">
                      <Label htmlFor="socialStrava" className="text-xs flex items-center gap-1.5 text-gray-600">
                        <StravaIcon className="h-3.5 w-3.5" />
                        Strava
                      </Label>
                      <Input
                        id="socialStrava"
                        value={formData.socialStrava}
                        onChange={(e) =>
                          setFormData({ ...formData, socialStrava: e.target.value })
                        }
                        placeholder="Profile URL"
                        className="rounded-md h-10"
                      />
                    </div>

                    {/* Website */}
                    <div className="space-y-1.5">
                      <Label htmlFor="socialWebsite" className="text-xs flex items-center gap-1.5 text-gray-600">
                        <ExternalLink className="h-3.5 w-3.5" />
                        Website
                      </Label>
                      <Input
                        id="socialWebsite"
                        value={formData.socialWebsite}
                        onChange={(e) =>
                          setFormData({ ...formData, socialWebsite: e.target.value })
                        }
                        placeholder="https://..."
                        className="rounded-md h-10"
                      />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Personal Information */}
            <Card className="bg-white rounded-md shadow-sm overflow-hidden">
              <CardHeader className="px-4 sm:px-6 py-4 sm:py-6">
                <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                  <User className="h-5 w-5" />
                  Personal Information
                </CardTitle>
                <CardDescription className="text-xs sm:text-sm">
                  Update your personal details and contact information
                </CardDescription>
              </CardHeader>
              <CardContent className="px-4 sm:px-6 pb-4 sm:pb-6 space-y-4">
                <div className="grid grid-cols-2 gap-3 sm:gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="firstName" className="text-sm">First Name</Label>
                    <Input
                      id="firstName"
                      value={formData.firstName}
                      onChange={(e) =>
                        setFormData({ ...formData, firstName: e.target.value })
                      }
                      className="rounded-md"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="lastName" className="text-sm">Last Name</Label>
                    <Input
                      id="lastName"
                      value={formData.lastName}
                      onChange={(e) =>
                        setFormData({ ...formData, lastName: e.target.value })
                      }
                      className="rounded-md"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="email" className="text-sm">Email Address</Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    className="rounded-md bg-gray-50"
                    disabled
                  />
                  <p className="text-xs text-gray-500">
                    Contact support to change your email
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="phone" className="text-sm">Phone Number</Label>
                  <Input
                    id="phone"
                    value={formData.phone}
                    onChange={(e) =>
                      setFormData({ ...formData, phone: e.target.value })
                    }
                    placeholder="Optional"
                    className="rounded-md"
                  />
                </div>
              </CardContent>
            </Card>

            {/* Notifications */}
            <Card className="bg-white rounded-md shadow-sm overflow-hidden">
              <CardHeader className="px-4 sm:px-6 py-4 sm:py-6">
                <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                  <Bell className="h-5 w-5" />
                  Notifications
                </CardTitle>
                <CardDescription className="text-xs sm:text-sm">
                  Choose what notifications you want to receive
                </CardDescription>
              </CardHeader>
              <CardContent className="px-4 sm:px-6 pb-4 sm:pb-6 space-y-0">
                {/* Email Notifications */}
                <div className="flex items-center justify-between py-3">
                  <div className="flex-1 min-w-0 pr-4">
                    <Label className="text-sm font-medium">Email Notifications</Label>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Receive important updates via email
                    </p>
                  </div>
                  <Switch
                    checked={formData.emailNotifications}
                    onCheckedChange={(checked) =>
                      setFormData({ ...formData, emailNotifications: checked })
                    }
                  />
                </div>
                <Separator />
                {/* Order Alerts */}
                <div className="flex items-center justify-between py-3">
                  <div className="flex-1 min-w-0 pr-4">
                    <Label className="text-sm font-medium">Order Alerts</Label>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Get notified about orders and purchases
                    </p>
                  </div>
                  <Switch
                    checked={formData.orderAlerts}
                    onCheckedChange={(checked) =>
                      setFormData({ ...formData, orderAlerts: checked })
                    }
                  />
                </div>
                <Separator />
                {/* Marketing Emails */}
                <div className="flex items-center justify-between py-3">
                  <div className="flex-1 min-w-0 pr-4">
                    <Label className="text-sm font-medium">Marketing Emails</Label>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Tips, offers, and recommendations
                    </p>
                  </div>
                  <Switch
                    checked={formData.marketingEmails}
                    onCheckedChange={(checked) =>
                      setFormData({ ...formData, marketingEmails: checked })
                    }
                  />
                </div>
              </CardContent>
            </Card>

            {/* Personalization Preferences */}
            {(ridingStyles.length > 0 || preferredBrands.length > 0 || interests.length > 0) && (
              <Card className="bg-white rounded-md shadow-sm overflow-hidden">
                <CardHeader className="px-4 sm:px-6 py-4 sm:py-6">
                  <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                    <Star className="h-5 w-5" />
                    Your Preferences
                  </CardTitle>
                  <CardDescription className="text-xs sm:text-sm">
                    Preferences you set during onboarding
                  </CardDescription>
                </CardHeader>
                <CardContent className="px-4 sm:px-6 pb-4 sm:pb-6 space-y-4">
                  {ridingStyles.length > 0 && (
                    <div>
                      <Label className="flex items-center gap-2 mb-2 text-sm">
                        <Bike className="h-4 w-4" />
                        Riding Styles
                      </Label>
                      <div className="flex flex-wrap gap-1.5 sm:gap-2">
                        {ridingStyles.map((style: string) => (
                          <span
                            key={style}
                            className="px-2.5 py-1 bg-gray-100 text-gray-700 text-xs sm:text-sm rounded-md"
                          >
                            {style.charAt(0).toUpperCase() + style.slice(1).replace('-', ' ')}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {preferredBrands.length > 0 && (
                    <div>
                      <Label className="flex items-center gap-2 mb-2 text-sm">
                        <ShoppingBag className="h-4 w-4" />
                        Preferred Brands
                      </Label>
                      <div className="flex flex-wrap gap-1.5 sm:gap-2">
                        {preferredBrands.map((brand: string) => (
                          <span
                            key={brand}
                            className="px-2.5 py-1 bg-gray-100 text-gray-700 text-xs sm:text-sm rounded-md"
                          >
                            {brand}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {experienceLevel !== 'Not set' && (
                    <div>
                      <Label className="flex items-center gap-2 mb-2 text-sm">
                        <Star className="h-4 w-4" />
                        Experience Level
                      </Label>
                      <span className="px-2.5 py-1 bg-gray-100 text-gray-700 text-xs sm:text-sm rounded-md">
                        {experienceLevel.charAt(0).toUpperCase() + experienceLevel.slice(1)}
                      </span>
                    </div>
                  )}

                  {budgetRange !== 'Not set' && (
                    <div>
                      <Label className="flex items-center gap-2 mb-2 text-sm">
                        <DollarSign className="h-4 w-4" />
                        Budget Range
                      </Label>
                      <span className="px-2.5 py-1 bg-gray-100 text-gray-700 text-xs sm:text-sm rounded-md">
                        {budgetRange.replace('-', ' - ').replace('under-', 'Under $').replace('over-', 'Over $')}
                      </span>
                    </div>
                  )}

                  {interests.length > 0 && (
                    <div>
                      <Label className="flex items-center gap-2 mb-2 text-sm">
                        <ShoppingBag className="h-4 w-4" />
                        Interests
                      </Label>
                      <div className="flex flex-wrap gap-1.5 sm:gap-2">
                        {interests.map((interest: string) => (
                          <span
                            key={interest}
                            className="px-2.5 py-1 bg-gray-100 text-gray-700 text-xs sm:text-sm rounded-md"
                          >
                            {interest.charAt(0).toUpperCase() + interest.slice(1).replace('-', ' ')}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  <p className="text-xs text-gray-500 pt-2">
                    Contact support to update these preferences.
                  </p>
                </CardContent>
              </Card>
            )}

            {/* Error Message */}
            {error && (
              <div className="bg-white border border-red-200 rounded-md p-4">
                <p className="text-sm text-red-600">{error}</p>
              </div>
            )}

            {/* Desktop Save Button */}
            <div className="hidden sm:flex justify-end">
              <Button
                onClick={handleSave}
                disabled={!hasChanges || saving}
                size="lg"
                className={cn(
                  'rounded-md min-w-[120px]',
                  saved && 'bg-green-600 hover:bg-green-700'
                )}
              >
                {saving ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Saving...
                  </>
                ) : saved ? (
                  <>
                    <Check className="mr-2 h-5 w-5" />
                    Saved!
                  </>
                ) : (
                  <>
                    <Save className="mr-2 h-5 w-5" />
                    Save Changes
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Mobile Sticky Save Button */}
          <div className="sm:hidden fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-gray-200 z-50">
            <Button
              onClick={handleSave}
              disabled={!hasChanges || saving}
              className={cn(
                'w-full rounded-md h-12',
                saved && 'bg-green-600 hover:bg-green-700'
              )}
            >
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Saving...
                </>
              ) : saved ? (
                <>
                  <Check className="mr-2 h-5 w-5" />
                  Saved!
                </>
              ) : (
                <>
                  <Save className="mr-2 h-5 w-5" />
                  Save Changes
                </>
              )}
            </Button>
          </div>
        </div>
      </MarketplaceLayout>
    </>
  )
}
