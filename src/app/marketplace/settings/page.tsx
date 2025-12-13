'use client'

import * as React from 'react'
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
  Store,
  Camera,
  MapPin,
  Instagram,
  Facebook,
  ExternalLink,
  Eye,
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
import { MobileSettingsView } from '@/components/marketplace/settings'
import { StripeConnectCard } from '@/components/settings/stripe-connect-card'

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

// Settings navigation tabs
type SettingsTab = 'profile' | 'payments' | 'notifications' | 'preferences'

interface NavItemProps {
  icon: React.ReactNode
  label: string
  isActive: boolean
  onClick: () => void
}

function NavItem({ icon, label, isActive, onClick }: NavItemProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 w-full px-3 py-2.5 text-sm font-medium rounded-md transition-colors text-left",
        isActive
          ? "text-gray-900 bg-white shadow-sm"
          : "text-gray-600 hover:bg-gray-200/70"
      )}
    >
      {icon}
      {label}
    </button>
  )
}

export default function MarketplaceSettingsPage() {
  const { user } = useAuth()
  const router = useRouter()
  const [saved, setSaved] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [formReady, setFormReady] = React.useState(false)
  const [activeTab, setActiveTab] = React.useState<SettingsTab>('profile')

  const { profile, loading: profileLoading, saving, saveProfile, refreshProfile } = useUserProfile()

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

  // Fetch full profile on mount to ensure we have all fields (including seller_display_name, bio, etc.)
  React.useEffect(() => {
    refreshProfile()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Redirect bike stores to their settings page (before rendering content)
  React.useEffect(() => {
    if (!profileLoading && profile) {
      const isBikeStore = profile.account_type === 'bicycle_store' && profile.bicycle_store === true
      if (isBikeStore) {
        router.replace('/settings')
      }
    }
  }, [profile, profileLoading, router])

  // Sync form data with profile - runs whenever profile updates
  React.useEffect(() => {
    if (profile) {
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
  }, [profile])

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

      // Refresh profile to get the latest data from server
      await refreshProfile()

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
          <div className="min-h-screen bg-gray-50 pt-16 sm:pt-16 pb-24 sm:pb-8">
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
  const hasPreferences = ridingStyles.length > 0 || preferredBrands.length > 0 || interests.length > 0

  // Get display name for preview
  const displayName = formData.sellerDisplayName || 
    `${formData.firstName} ${formData.lastName}`.trim() || 
    'Your Name'

  return (
    <>
      {/* Mobile View - iOS-style settings */}
      <div className="sm:hidden min-h-screen bg-gray-50 pt-16">
        <MarketplaceHeader compactSearchOnMobile />
        <MobileSettingsView
          formData={formData}
          setFormData={setFormData}
          preferences={preferences}
          hasChanges={hasChanges}
          saving={saving}
          saved={saved}
          onSave={handleSave}
          userId={user?.id}
        />
      </div>

      {/* Desktop View - Sidebar Navigation Layout */}
      <div className="hidden sm:block">
        <MarketplaceHeader compactSearchOnMobile />

        <MarketplaceLayout>
          <div className="min-h-screen bg-gray-50 pt-16">
            <div className="flex w-full">
              {/* Sidebar */}
              <aside className="w-72 flex-shrink-0 border-r border-gray-200 bg-white min-h-[calc(100vh-4rem)]">
                <div className="sticky top-16 p-6 space-y-6">
                  {/* Profile Summary */}
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <div className="h-14 w-14 rounded-full border-2 border-gray-200 bg-gray-100 overflow-hidden flex-shrink-0">
                        {formData.logoUrl ? (
                          <Image
                            src={formData.logoUrl}
                            alt="Profile"
                            width={56}
                            height={56}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="h-full w-full flex items-center justify-center bg-gradient-to-br from-gray-100 to-gray-200">
                            <span className="text-xl font-bold text-gray-400">
                              {displayName.charAt(0).toUpperCase()}
                            </span>
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-gray-900 truncate">{displayName}</p>
                        {formData.location && (
                          <p className="text-xs text-gray-500 flex items-center gap-1 truncate">
                            <MapPin className="h-3 w-3 flex-shrink-0" />
                            {formData.location}
                          </p>
                        )}
                      </div>
                    </div>
                    {user?.id && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full rounded-md"
                        onClick={() => router.push(`/marketplace/store/${user.id}`)}
                      >
                        <Eye className="h-4 w-4 mr-2" />
                        View Public Profile
                      </Button>
                    )}
                  </div>

                  <Separator />

                  {/* Navigation */}
                  <nav className="space-y-1">
                    <div className="bg-gray-100 p-1 rounded-md space-y-0.5">
                      <NavItem
                        icon={<Store className="h-4 w-4" />}
                        label="Profile"
                        isActive={activeTab === 'profile'}
                        onClick={() => setActiveTab('profile')}
                      />
                      <NavItem
                        icon={<DollarSign className="h-4 w-4" />}
                        label="Payments"
                        isActive={activeTab === 'payments'}
                        onClick={() => setActiveTab('payments')}
                      />
                      <NavItem
                        icon={<Bell className="h-4 w-4" />}
                        label="Notifications"
                        isActive={activeTab === 'notifications'}
                        onClick={() => setActiveTab('notifications')}
                      />
                      {hasPreferences && (
                        <NavItem
                          icon={<Star className="h-4 w-4" />}
                          label="Preferences"
                          isActive={activeTab === 'preferences'}
                          onClick={() => setActiveTab('preferences')}
                        />
                      )}
                    </div>
                  </nav>

                  {/* Save Button - in sidebar */}
                  <div className="pt-4">
                    <Button
                      onClick={handleSave}
                      disabled={!hasChanges || saving}
                      className={cn(
                        'w-full rounded-md',
                        saved && 'bg-green-600 hover:bg-green-700'
                      )}
                    >
                      {saving ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Saving...
                        </>
                      ) : saved ? (
                        <>
                          <Check className="mr-2 h-4 w-4" />
                          Saved!
                        </>
                      ) : (
                        <>
                          <Save className="mr-2 h-4 w-4" />
                          Save Changes
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </aside>

              {/* Main Content */}
              <main className="flex-1 p-8 min-w-0">
                <div className="max-w-4xl space-y-6">
                  {/* Error Message */}
                  {error && (
                    <div className="bg-white border border-red-200 rounded-md p-4">
                      <p className="text-sm text-red-600">{error}</p>
                    </div>
                  )}

                  {/* Profile Tab */}
                  {activeTab === 'profile' && (
                    <>
                      {/* Seller Profile Card */}
                      <Card className="bg-white rounded-md shadow-sm">
                        <CardHeader className="px-6 py-5">
                          <CardTitle className="flex items-center gap-2 text-lg">
                            <Store className="h-5 w-5" />
                            Seller Profile
                          </CardTitle>
                          <CardDescription className="text-sm">
                            Customise how your profile appears to other users
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="px-6 pb-6 space-y-6">
                          {/* Profile Photo Preview */}
                          <div className="flex items-center gap-4">
                            <div className="h-20 w-20 rounded-full border-2 border-gray-200 bg-gray-100 overflow-hidden flex-shrink-0">
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
                                  <span className="text-2xl font-bold text-gray-400">
                                    {displayName.charAt(0).toUpperCase()}
                                  </span>
                                </div>
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-lg font-semibold text-gray-900 truncate">{displayName}</p>
                              {formData.location && (
                                <p className="text-sm text-gray-500 flex items-center gap-1">
                                  <MapPin className="h-3.5 w-3.5" />
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
                          <div className="space-y-4">
                            <Label className="text-sm font-medium">Social Links</Label>
                            
                            <div className="grid grid-cols-2 gap-4">
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

                      {/* Personal Information Card */}
                      <Card className="bg-white rounded-md shadow-sm">
                        <CardHeader className="px-6 py-5">
                          <CardTitle className="flex items-center gap-2 text-lg">
                            <User className="h-5 w-5" />
                            Personal Information
                          </CardTitle>
                          <CardDescription className="text-sm">
                            Update your personal details and contact information
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="px-6 pb-6 space-y-4">
                          <div className="grid grid-cols-2 gap-4">
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
                    </>
                  )}

                  {/* Payments Tab */}
                  {activeTab === 'payments' && (
                    <Card className="bg-white rounded-md shadow-sm">
                      <CardHeader className="px-6 py-5">
                        <CardTitle className="flex items-center gap-2 text-lg">
                          <DollarSign className="h-5 w-5" />
                          Payments & Payouts
                        </CardTitle>
                        <CardDescription className="text-sm">
                          Connect your bank account to receive payouts when you sell items
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="px-6 pb-6">
                        <StripeConnectCard />
                      </CardContent>
                    </Card>
                  )}

                  {/* Notifications Tab */}
                  {activeTab === 'notifications' && (
                    <Card className="bg-white rounded-md shadow-sm">
                      <CardHeader className="px-6 py-5">
                        <CardTitle className="flex items-center gap-2 text-lg">
                          <Bell className="h-5 w-5" />
                          Notifications
                        </CardTitle>
                        <CardDescription className="text-sm">
                          Choose what notifications you want to receive
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="px-6 pb-6 space-y-0">
                        {/* Email Notifications */}
                        <div className="flex items-center justify-between py-4">
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
                        <div className="flex items-center justify-between py-4">
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
                        <div className="flex items-center justify-between py-4">
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
                  )}

                  {/* Preferences Tab */}
                  {activeTab === 'preferences' && hasPreferences && (
                    <Card className="bg-white rounded-md shadow-sm">
                      <CardHeader className="px-6 py-5">
                        <CardTitle className="flex items-center gap-2 text-lg">
                          <Star className="h-5 w-5" />
                          Your Preferences
                        </CardTitle>
                        <CardDescription className="text-sm">
                          Preferences you set during onboarding
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="px-6 pb-6 space-y-6">
                        {ridingStyles.length > 0 && (
                          <div>
                            <Label className="flex items-center gap-2 mb-3 text-sm font-medium">
                              <Bike className="h-4 w-4" />
                              Riding Styles
                            </Label>
                            <div className="flex flex-wrap gap-2">
                              {ridingStyles.map((style: string) => (
                                <span
                                  key={style}
                                  className="px-3 py-1.5 bg-gray-100 text-gray-700 text-sm rounded-md"
                                >
                                  {style.charAt(0).toUpperCase() + style.slice(1).replace('-', ' ')}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {preferredBrands.length > 0 && (
                          <div>
                            <Label className="flex items-center gap-2 mb-3 text-sm font-medium">
                              <ShoppingBag className="h-4 w-4" />
                              Preferred Brands
                            </Label>
                            <div className="flex flex-wrap gap-2">
                              {preferredBrands.map((brand: string) => (
                                <span
                                  key={brand}
                                  className="px-3 py-1.5 bg-gray-100 text-gray-700 text-sm rounded-md"
                                >
                                  {brand}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {experienceLevel !== 'Not set' && (
                          <div>
                            <Label className="flex items-center gap-2 mb-3 text-sm font-medium">
                              <Star className="h-4 w-4" />
                              Experience Level
                            </Label>
                            <span className="px-3 py-1.5 bg-gray-100 text-gray-700 text-sm rounded-md">
                              {experienceLevel.charAt(0).toUpperCase() + experienceLevel.slice(1)}
                            </span>
                          </div>
                        )}

                        {budgetRange !== 'Not set' && (
                          <div>
                            <Label className="flex items-center gap-2 mb-3 text-sm font-medium">
                              <DollarSign className="h-4 w-4" />
                              Budget Range
                            </Label>
                            <span className="px-3 py-1.5 bg-gray-100 text-gray-700 text-sm rounded-md">
                              {budgetRange.replace('-', ' - ').replace('under-', 'Under $').replace('over-', 'Over $')}
                            </span>
                          </div>
                        )}

                        {interests.length > 0 && (
                          <div>
                            <Label className="flex items-center gap-2 mb-3 text-sm font-medium">
                              <ShoppingBag className="h-4 w-4" />
                              Interests
                            </Label>
                            <div className="flex flex-wrap gap-2">
                              {interests.map((interest: string) => (
                                <span
                                  key={interest}
                                  className="px-3 py-1.5 bg-gray-100 text-gray-700 text-sm rounded-md"
                                >
                                  {interest.charAt(0).toUpperCase() + interest.slice(1).replace('-', ' ')}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        <div className="pt-2">
                          <p className="text-xs text-gray-500">
                            Contact support to update these preferences.
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </div>
              </main>
            </div>
          </div>
        </MarketplaceLayout>
      </div>
    </>
  )
}
