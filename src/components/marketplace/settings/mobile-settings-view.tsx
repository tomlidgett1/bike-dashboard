"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  User,
  Mail,
  Phone,
  Bell,
  Share2,
  Bike,
  ShoppingBag,
  Star,
  DollarSign,
  Eye,
  Check,
  Loader2,
  Save,
  ChevronLeft,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SettingsRow, SettingsSection } from "./settings-row";
import { SettingsProfileHeader } from "./settings-profile-header";
import { SettingsBottomSheet } from "./settings-bottom-sheet";
import { EditProfileSheet } from "./edit-profile-sheet";
import { EditSocialLinksSheet } from "./edit-social-links-sheet";
import { StripeConnectCard } from "@/components/settings/stripe-connect-card";

interface FormData {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  emailNotifications: boolean;
  orderAlerts: boolean;
  marketingEmails: boolean;
  sellerDisplayName: string;
  bio: string;
  location: string;
  logoUrl: string;
  socialInstagram: string;
  socialFacebook: string;
  socialStrava: string;
  socialWebsite: string;
}

interface Preferences {
  riding_styles?: string[];
  preferred_brands?: string[];
  experience_level?: string;
  budget_range?: string;
  interests?: string[];
}

interface MobileSettingsViewProps {
  formData: FormData;
  setFormData: React.Dispatch<React.SetStateAction<FormData>>;
  preferences: Preferences;
  hasChanges: boolean;
  saving: boolean;
  saved: boolean;
  onSave: () => void;
  userId?: string;
}

type SheetType = "profile" | "phone" | "social" | null;

export function MobileSettingsView({
  formData,
  setFormData,
  preferences,
  hasChanges,
  saving,
  saved,
  onSave,
  userId,
}: MobileSettingsViewProps) {
  const router = useRouter();
  const [activeSheet, setActiveSheet] = React.useState<SheetType>(null);
  const [localSaving, setLocalSaving] = React.useState(false);

  // Get display name
  const displayName = formData.sellerDisplayName || 
    `${formData.firstName} ${formData.lastName}`.trim() || 
    "Your Name";

  // Count social links
  const socialLinksCount = [
    formData.socialInstagram,
    formData.socialFacebook,
    formData.socialStrava,
    formData.socialWebsite,
  ].filter(Boolean).length;

  // Handle toggle changes (auto-save behavior)
  const handleToggle = (field: keyof FormData, value: boolean) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  // Handle profile sheet save
  const handleProfileSave = (data: {
    firstName: string;
    lastName: string;
    sellerDisplayName: string;
    bio: string;
    location: string;
    logoUrl: string;
  }) => {
    setFormData((prev) => ({
      ...prev,
      ...data,
    }));
    setActiveSheet(null);
  };

  // Handle phone save
  const handlePhoneSave = (phone: string) => {
    setFormData((prev) => ({ ...prev, phone }));
    setActiveSheet(null);
  };

  // Handle social links save
  const handleSocialSave = (data: {
    socialInstagram: string;
    socialFacebook: string;
    socialStrava: string;
    socialWebsite: string;
  }) => {
    setFormData((prev) => ({
      ...prev,
      ...data,
    }));
    setActiveSheet(null);
  };

  // Preferences data
  const ridingStyles = preferences.riding_styles || [];
  const preferredBrands = preferences.preferred_brands || [];
  const experienceLevel = preferences.experience_level;
  const budgetRange = preferences.budget_range;
  const interests = preferences.interests || [];
  const hasPreferences = ridingStyles.length > 0 || preferredBrands.length > 0 || interests.length > 0;

  return (
    <>
      {/* Fixed Header */}
      <div className="sticky top-0 z-50 bg-white border-b border-gray-200">
        <div className="flex items-center justify-between px-4 py-3">
          <button
            type="button"
            onClick={() => router.back()}
            className="flex items-center gap-1 text-gray-600 -ml-2 p-2 rounded-md hover:bg-gray-100 active:bg-gray-200 transition-colors"
          >
            <ChevronLeft className="h-5 w-5" />
            <span className="text-sm font-medium">Back</span>
          </button>
          
          <h1 className="text-base font-semibold text-gray-900">Settings</h1>

          {userId && (
            <button
              type="button"
              onClick={() => router.push(`/marketplace/store/${userId}`)}
              className="p-2 -mr-2 rounded-md hover:bg-gray-100 active:bg-gray-200 transition-colors"
            >
              <Eye className="h-5 w-5 text-gray-600" />
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="pb-24 bg-gray-50">
        {/* Profile Header */}
        <SettingsProfileHeader
          displayName={displayName}
          location={formData.location}
          avatarUrl={formData.logoUrl}
          onEditProfile={() => setActiveSheet("profile")}
        />

        {/* Personal Info Section */}
        <SettingsSection title="Personal Info">
          <SettingsRow
            icon={<User className="h-4 w-4 text-gray-500" />}
            label="Name"
            value={`${formData.firstName} ${formData.lastName}`.trim() || "Not set"}
            type="navigation"
            onClick={() => setActiveSheet("profile")}
          />
          <SettingsRow
            icon={<Mail className="h-4 w-4 text-gray-500" />}
            label="Email"
            value={formData.email || "Not set"}
            type="readonly"
          />
          <SettingsRow
            icon={<Phone className="h-4 w-4 text-gray-500" />}
            label="Phone"
            value={formData.phone || "Not set"}
            type="navigation"
            onClick={() => setActiveSheet("phone")}
          />
        </SettingsSection>

        {/* Seller Profile Section */}
        <SettingsSection title="Seller Profile">
          <SettingsRow
            label="Display Name"
            value={formData.sellerDisplayName || "Using your name"}
            type="navigation"
            onClick={() => setActiveSheet("profile")}
          />
          <SettingsRow
            label="Bio"
            value={formData.bio ? `${formData.bio.slice(0, 30)}...` : "Add a bio"}
            type="navigation"
            onClick={() => setActiveSheet("profile")}
          />
          <SettingsRow
            icon={<Share2 className="h-4 w-4 text-gray-500" />}
            label="Social Links"
            value={socialLinksCount > 0 ? `${socialLinksCount} linked` : "None"}
            type="navigation"
            onClick={() => setActiveSheet("social")}
          />
        </SettingsSection>

        {/* Payments Section */}
        <SettingsSection title="Payments & Payouts">
          <div className="px-4 py-2">
            <StripeConnectCard />
          </div>
        </SettingsSection>

        {/* Notifications Section */}
        <SettingsSection title="Notifications">
          <SettingsRow
            icon={<Bell className="h-4 w-4 text-gray-500" />}
            label="Email Notifications"
            description="Receive important updates via email"
            type="toggle"
            checked={formData.emailNotifications}
            onToggle={(checked) => handleToggle("emailNotifications", checked)}
          />
          <SettingsRow
            label="Order Alerts"
            description="Get notified about orders and purchases"
            type="toggle"
            checked={formData.orderAlerts}
            onToggle={(checked) => handleToggle("orderAlerts", checked)}
          />
          <SettingsRow
            label="Marketing Emails"
            description="Tips, offers, and recommendations"
            type="toggle"
            checked={formData.marketingEmails}
            onToggle={(checked) => handleToggle("marketingEmails", checked)}
          />
        </SettingsSection>

        {/* Preferences Section (if exists) */}
        {hasPreferences && (
          <SettingsSection title="Your Preferences">
            {ridingStyles.length > 0 && (
              <SettingsRow
                icon={<Bike className="h-4 w-4 text-gray-500" />}
                label="Riding Styles"
                value={ridingStyles.slice(0, 2).map(s => 
                  s.charAt(0).toUpperCase() + s.slice(1).replace("-", " ")
                ).join(", ") + (ridingStyles.length > 2 ? ` +${ridingStyles.length - 2}` : "")}
                type="readonly"
              />
            )}
            {preferredBrands.length > 0 && (
              <SettingsRow
                icon={<ShoppingBag className="h-4 w-4 text-gray-500" />}
                label="Preferred Brands"
                value={preferredBrands.length > 2 
                  ? `${preferredBrands.slice(0, 2).join(", ")} +${preferredBrands.length - 2}`
                  : preferredBrands.join(", ")}
                type="readonly"
              />
            )}
            {experienceLevel && experienceLevel !== "Not set" && (
              <SettingsRow
                icon={<Star className="h-4 w-4 text-gray-500" />}
                label="Experience"
                value={experienceLevel.charAt(0).toUpperCase() + experienceLevel.slice(1)}
                type="readonly"
              />
            )}
            {budgetRange && budgetRange !== "Not set" && (
              <SettingsRow
                icon={<DollarSign className="h-4 w-4 text-gray-500" />}
                label="Budget Range"
                value={budgetRange.replace("-", " - ").replace("under-", "Under $").replace("over-", "Over $")}
                type="readonly"
              />
            )}
          </SettingsSection>
        )}

        {/* Info text */}
        {hasPreferences && (
          <p className="px-4 py-3 text-xs text-gray-500 text-center">
            Contact support to update your preferences
          </p>
        )}
      </div>

      {/* Sticky Save Button */}
      <AnimatePresence>
        {hasChanges && (
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.04, 0.62, 0.23, 0.98] }}
            className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-gray-200 z-50 pb-[calc(16px+env(safe-area-inset-bottom))]"
          >
            <Button
              onClick={onSave}
              disabled={saving}
              className={cn(
                "w-full h-12 rounded-md font-medium transition-all",
                saved 
                  ? "bg-green-600 hover:bg-green-700"
                  : "bg-gray-900 hover:bg-gray-800"
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
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bottom Sheets */}
      <EditProfileSheet
        isOpen={activeSheet === "profile"}
        onClose={() => setActiveSheet(null)}
        formData={{
          firstName: formData.firstName,
          lastName: formData.lastName,
          sellerDisplayName: formData.sellerDisplayName,
          bio: formData.bio,
          location: formData.location,
          logoUrl: formData.logoUrl,
        }}
        onSave={handleProfileSave}
        saving={localSaving}
        userId={userId}
      />

      <EditSocialLinksSheet
        isOpen={activeSheet === "social"}
        onClose={() => setActiveSheet(null)}
        formData={{
          socialInstagram: formData.socialInstagram,
          socialFacebook: formData.socialFacebook,
          socialStrava: formData.socialStrava,
          socialWebsite: formData.socialWebsite,
        }}
        onSave={handleSocialSave}
        saving={localSaving}
      />

      {/* Phone Edit Sheet */}
      <PhoneEditSheet
        isOpen={activeSheet === "phone"}
        onClose={() => setActiveSheet(null)}
        phone={formData.phone}
        onSave={handlePhoneSave}
        saving={localSaving}
      />
    </>
  );
}

// Simple phone edit sheet
function PhoneEditSheet({
  isOpen,
  onClose,
  phone,
  onSave,
  saving,
}: {
  isOpen: boolean;
  onClose: () => void;
  phone: string;
  onSave: (phone: string) => void;
  saving: boolean;
}) {
  const [localPhone, setLocalPhone] = React.useState(phone);

  React.useEffect(() => {
    if (isOpen) {
      setLocalPhone(phone);
    }
  }, [isOpen, phone]);

  return (
    <SettingsBottomSheet
      isOpen={isOpen}
      onClose={onClose}
      title="Phone Number"
      onSave={() => onSave(localPhone)}
      saving={saving}
    >
      <div className="space-y-2">
        <label htmlFor="phone-edit" className="text-sm font-medium text-gray-700">
          Phone Number
        </label>
        <div className="relative">
          <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            id="phone-edit"
            type="tel"
            value={localPhone}
            onChange={(e) => setLocalPhone(e.target.value)}
            className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-900 text-base"
            placeholder="0400 000 000"
          />
        </div>
        <p className="text-xs text-gray-500">
          Optional - only visible to you
        </p>
      </div>
    </SettingsBottomSheet>
  );
}

