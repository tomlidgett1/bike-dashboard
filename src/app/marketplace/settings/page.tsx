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
  Settings as SettingsIcon,
  Store,
  Camera,
  MapPin,
  Instagram,
  Facebook,
  ExternalLink,
  ImageIcon,
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
    coverImageUrl: '',
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
        coverImageUrl: profile.cover_image_url || '',
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
        cover_image_url: formData.coverImageUrl,
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
    formData.coverImageUrl !== (profile?.cover_image_url || '') ||
    formData.socialInstagram !== (profile?.social_links?.instagram || '') ||
    formData.socialFacebook !== (profile?.social_links?.facebook || '') ||
    formData.socialStrava !== (profile?.social_links?.strava || '') ||
    formData.socialWebsite !== (profile?.social_links?.website || '')

  // Show loading until BOTH profile is loaded AND form data is populated
  if (profileLoading || !formReady) {
    return (
      <>
        <MarketplaceHeader />
        <MarketplaceLayout>
          <div className="min-h-screen bg-gray-50 pt-16">
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
      <MarketplaceHeader />

      <MarketplaceLayout>
        <div className="min-h-screen bg-gray-50 pt-16">
          {/* Page Header */}
          <div className="border-b border-gray-200 bg-white">
            <div className="max-w-[1920px] mx-auto px-6 py-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-12 h-12 rounded-md bg-gray-100">
                    <SettingsIcon className="h-6 w-6 text-gray-700" />
                  </div>
                  <div>
                    <h1 className="text-2xl font-bold text-gray-900">Account Settings</h1>
                    <p className="text-sm text-gray-600">Manage your profile and preferences</p>
                  </div>
                </div>
                {/* View Profile Button */}
                {user?.id && (
                  <Button
                    variant="outline"
                    className="rounded-md"
                    onClick={() => router.push(`/marketplace/store/${user.id}`)}
                  >
                    <Eye className="h-4 w-4 mr-2" />
                    View My Profile
                  </Button>
                )}
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="max-w-[1920px] mx-auto px-6 py-8 space-y-6">
            
            {/* Seller Profile Section */}
            <div>
              <Card className="bg-white rounded-md shadow-sm">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Store className="h-5 w-5" />
                    Seller Profile
                  </CardTitle>
                  <CardDescription>
                    Customise how your profile appears to other users
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Profile & Cover Image Preview */}
                  <div className="relative rounded-md overflow-hidden bg-gray-100">
                    {/* Cover Image */}
                    <div className="h-32 sm:h-40 relative bg-gradient-to-br from-gray-700 to-gray-900">
                      {formData.coverImageUrl ? (
                        <Image
                          src={formData.coverImageUrl}
                          alt="Cover"
                          fill
                          className="object-cover"
                        />
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="text-center text-white/60">
                            <ImageIcon className="h-8 w-8 mx-auto mb-1" />
                            <p className="text-xs">Add a cover image</p>
                          </div>
                        </div>
                      )}
                    </div>
                    
                    {/* Profile Photo */}
                    <div className="absolute bottom-0 left-4 transform translate-y-1/2">
                      <div className="h-20 w-20 sm:h-24 sm:w-24 rounded-full border-4 border-white bg-white overflow-hidden shadow-md">
                        {formData.logoUrl ? (
                          <Image
                            src={formData.logoUrl}
                            alt="Profile"
                            fill
                            className="object-cover"
                          />
                        ) : (
                          <div className="h-full w-full flex items-center justify-center bg-gradient-to-br from-gray-100 to-gray-200">
                            <span className="text-2xl sm:text-3xl font-bold text-gray-400">
                              {displayName.charAt(0).toUpperCase()}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Preview Name */}
                  <div className="pt-10 sm:pt-12 pl-4">
                    <p className="text-lg font-bold text-gray-900">{displayName}</p>
                    {formData.location && (
                      <p className="text-sm text-gray-500 flex items-center gap-1">
                        <MapPin className="h-3.5 w-3.5" />
                        {formData.location}
                      </p>
                    )}
                  </div>

                  <Separator />

                  {/* Display Name */}
                  <div className="space-y-2">
                    <Label htmlFor="sellerDisplayName">Display Name</Label>
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
                    <Label htmlFor="bio">Bio</Label>
                    <Textarea
                      id="bio"
                      value={formData.bio}
                      onChange={(e) =>
                        setFormData({ ...formData, bio: e.target.value })
                      }
                      placeholder="Tell other cyclists about yourself... What do you ride? What are you passionate about?"
                      className="rounded-md min-h-[100px] resize-none"
                      maxLength={500}
                    />
                    <p className="text-xs text-gray-500 text-right">
                      {formData.bio.length}/500 characters
                    </p>
                  </div>

                  {/* Location */}
                  <div className="space-y-2">
                    <Label htmlFor="location">Location</Label>
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
                    <Label htmlFor="logoUrl">Profile Photo URL</Label>
                    <div className="relative">
                      <Camera className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <Input
                        id="logoUrl"
                        value={formData.logoUrl}
                        onChange={(e) =>
                          setFormData({ ...formData, logoUrl: e.target.value })
                        }
                        placeholder="https://example.com/your-photo.jpg"
                        className="rounded-md pl-10"
                      />
                    </div>
                    <p className="text-xs text-gray-500">
                      Paste a URL to your profile photo
                    </p>
                  </div>

                  {/* Cover Image URL */}
                  <div className="space-y-2">
                    <Label htmlFor="coverImageUrl">Cover Image URL</Label>
                    <div className="relative">
                      <ImageIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <Input
                        id="coverImageUrl"
                        value={formData.coverImageUrl}
                        onChange={(e) =>
                          setFormData({ ...formData, coverImageUrl: e.target.value })
                        }
                        placeholder="https://example.com/your-cover.jpg"
                        className="rounded-md pl-10"
                      />
                    </div>
                    <p className="text-xs text-gray-500">
                      Paste a URL for your profile banner image
                    </p>
                  </div>

                  <Separator />

                  {/* Social Links */}
                  <div className="space-y-4">
                    <Label className="text-base font-medium">Social Links</Label>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Instagram */}
                      <div className="space-y-2">
                        <Label htmlFor="socialInstagram" className="text-sm flex items-center gap-2">
                          <Instagram className="h-4 w-4" />
                          Instagram
                        </Label>
                        <Input
                          id="socialInstagram"
                          value={formData.socialInstagram}
                          onChange={(e) =>
                            setFormData({ ...formData, socialInstagram: e.target.value })
                          }
                          placeholder="@yourusername or full URL"
                          className="rounded-md"
                        />
                      </div>

                      {/* Facebook */}
                      <div className="space-y-2">
                        <Label htmlFor="socialFacebook" className="text-sm flex items-center gap-2">
                          <Facebook className="h-4 w-4" />
                          Facebook
                        </Label>
                        <Input
                          id="socialFacebook"
                          value={formData.socialFacebook}
                          onChange={(e) =>
                            setFormData({ ...formData, socialFacebook: e.target.value })
                          }
                          placeholder="Your page or profile URL"
                          className="rounded-md"
                        />
                      </div>

                      {/* Strava */}
                      <div className="space-y-2">
                        <Label htmlFor="socialStrava" className="text-sm flex items-center gap-2">
                          <StravaIcon className="h-4 w-4" />
                          Strava
                        </Label>
                        <Input
                          id="socialStrava"
                          value={formData.socialStrava}
                          onChange={(e) =>
                            setFormData({ ...formData, socialStrava: e.target.value })
                          }
                          placeholder="Your athlete ID or profile URL"
                          className="rounded-md"
                        />
                      </div>

                      {/* Website */}
                      <div className="space-y-2">
                        <Label htmlFor="socialWebsite" className="text-sm flex items-center gap-2">
                          <ExternalLink className="h-4 w-4" />
                          Website
                        </Label>
                        <Input
                          id="socialWebsite"
                          value={formData.socialWebsite}
                          onChange={(e) =>
                            setFormData({ ...formData, socialWebsite: e.target.value })
                          }
                          placeholder="https://yourwebsite.com"
                          className="rounded-md"
                        />
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Personal Information */}
            <div>
              <Card className="bg-white rounded-md shadow-sm">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <User className="h-5 w-5" />
                    Personal Information
                  </CardTitle>
                  <CardDescription>
                    Update your personal details and contact information
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="firstName">First Name</Label>
                      <Input
                        id="firstName"
                        value={formData.firstName}
                        onChange={(e) =>
                          setFormData({ ...formData, firstName: e.target.value })
                        }
                        className="rounded-md"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="lastName">Last Name</Label>
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

                  <div className="space-y-2">
                    <Label htmlFor="email">Email Address</Label>
                    <Input
                      id="email"
                      type="email"
                      value={formData.email}
                      className="rounded-md bg-gray-50"
                      disabled
                    />
                    <p className="text-xs text-gray-500">
                      Email cannot be changed here. Contact support if you need to update it.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="phone">Phone Number</Label>
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
            </div>

            {/* Notifications */}
            <div>
              <Card className="bg-white rounded-md shadow-sm">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Bell className="h-5 w-5" />
                    Notification Preferences
                  </CardTitle>
                  <CardDescription>
                    Choose what notifications you want to receive
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Email Notifications</Label>
                      <p className="text-sm text-gray-500">
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
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Order Alerts</Label>
                      <p className="text-sm text-gray-500">
                        Get notified about your orders and purchases
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
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Marketing Emails</Label>
                      <p className="text-sm text-gray-500">
                        Receive tips, offers, and product recommendations
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
            </div>

            {/* Personalization Preferences */}
            {(ridingStyles.length > 0 || preferredBrands.length > 0 || interests.length > 0) && (
              <div>
                <Card className="bg-white rounded-md shadow-sm">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Star className="h-5 w-5" />
                      Your Preferences
                    </CardTitle>
                    <CardDescription>
                      Preferences you set during onboarding
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {ridingStyles.length > 0 && (
                      <div>
                        <Label className="flex items-center gap-2 mb-2">
                          <Bike className="h-4 w-4" />
                          Riding Styles
                        </Label>
                        <div className="flex flex-wrap gap-2">
                          {ridingStyles.map((style: string) => (
                            <span
                              key={style}
                              className="px-3 py-1 bg-gray-100 text-gray-700 text-sm rounded-md"
                            >
                              {style.charAt(0).toUpperCase() + style.slice(1).replace('-', ' ')}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {preferredBrands.length > 0 && (
                      <div>
                        <Label className="flex items-center gap-2 mb-2">
                          <ShoppingBag className="h-4 w-4" />
                          Preferred Brands
                        </Label>
                        <div className="flex flex-wrap gap-2">
                          {preferredBrands.map((brand: string) => (
                            <span
                              key={brand}
                              className="px-3 py-1 bg-gray-100 text-gray-700 text-sm rounded-md"
                            >
                              {brand}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {experienceLevel !== 'Not set' && (
                      <div>
                        <Label className="flex items-center gap-2 mb-2">
                          <Star className="h-4 w-4" />
                          Experience Level
                        </Label>
                        <span className="px-3 py-1 bg-gray-100 text-gray-700 text-sm rounded-md">
                          {experienceLevel.charAt(0).toUpperCase() + experienceLevel.slice(1)}
                        </span>
                      </div>
                    )}

                    {budgetRange !== 'Not set' && (
                      <div>
                        <Label className="flex items-center gap-2 mb-2">
                          <DollarSign className="h-4 w-4" />
                          Budget Range
                        </Label>
                        <span className="px-3 py-1 bg-gray-100 text-gray-700 text-sm rounded-md">
                          {budgetRange.replace('-', ' - ').replace('under-', 'Under $').replace('over-', 'Over $')}
                        </span>
                      </div>
                    )}

                    {interests.length > 0 && (
                      <div>
                        <Label className="flex items-center gap-2 mb-2">
                          <ShoppingBag className="h-4 w-4" />
                          Interests
                        </Label>
                        <div className="flex flex-wrap gap-2">
                          {interests.map((interest: string) => (
                            <span
                              key={interest}
                              className="px-3 py-1 bg-gray-100 text-gray-700 text-sm rounded-md"
                            >
                              {interest.charAt(0).toUpperCase() + interest.slice(1).replace('-', ' ')}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    <p className="text-xs text-gray-500 pt-2">
                      These preferences help us personalise your marketplace experience. To update them, please contact support.
                    </p>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Error Message */}
            {error && (
              <div>
                <div className="bg-white border border-red-200 rounded-md p-4">
                  <p className="text-sm text-red-600">{error}</p>
                </div>
              </div>
            )}

            {/* Save Button */}
            <div className="flex justify-end">
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
        </div>
      </MarketplaceLayout>
    </>
  )
}
