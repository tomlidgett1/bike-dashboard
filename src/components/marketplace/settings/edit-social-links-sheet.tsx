"use client";

import * as React from "react";
import { Instagram, Facebook, ExternalLink } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SettingsBottomSheet } from "./settings-bottom-sheet";

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

interface SocialLinksData {
  socialInstagram: string;
  socialFacebook: string;
  socialStrava: string;
  socialWebsite: string;
}

interface EditSocialLinksSheetProps {
  isOpen: boolean;
  onClose: () => void;
  formData: SocialLinksData;
  onSave: (data: SocialLinksData) => void;
  saving?: boolean;
}

export function EditSocialLinksSheet({
  isOpen,
  onClose,
  formData,
  onSave,
  saving = false,
}: EditSocialLinksSheetProps) {
  const [localData, setLocalData] = React.useState<SocialLinksData>(formData);

  // Sync when sheet opens
  React.useEffect(() => {
    if (isOpen) {
      setLocalData(formData);
    }
  }, [isOpen, formData]);

  const handleSave = () => {
    onSave(localData);
  };

  const updateField = (field: keyof SocialLinksData, value: string) => {
    setLocalData((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <SettingsBottomSheet
      isOpen={isOpen}
      onClose={onClose}
      title="Social Links"
      onSave={handleSave}
      saving={saving}
    >
      <div className="space-y-5">
        {/* Instagram */}
        <div className="space-y-2">
          <Label htmlFor="instagram" className="text-sm font-medium text-gray-700">
            <div className="flex items-center gap-2">
              <Instagram className="h-4 w-4 text-gray-500" />
              Instagram
            </div>
          </Label>
          <Input
            id="instagram"
            value={localData.socialInstagram}
            onChange={(e) => updateField("socialInstagram", e.target.value)}
            className="rounded-md h-11"
            placeholder="@yourusername"
          />
        </div>

        {/* Facebook */}
        <div className="space-y-2">
          <Label htmlFor="facebook" className="text-sm font-medium text-gray-700">
            <div className="flex items-center gap-2">
              <Facebook className="h-4 w-4 text-gray-500" />
              Facebook
            </div>
          </Label>
          <Input
            id="facebook"
            value={localData.socialFacebook}
            onChange={(e) => updateField("socialFacebook", e.target.value)}
            className="rounded-md h-11"
            placeholder="Your page URL"
          />
        </div>

        {/* Strava */}
        <div className="space-y-2">
          <Label htmlFor="strava" className="text-sm font-medium text-gray-700">
            <div className="flex items-center gap-2">
              <StravaIcon className="h-4 w-4 text-gray-500" />
              Strava
            </div>
          </Label>
          <Input
            id="strava"
            value={localData.socialStrava}
            onChange={(e) => updateField("socialStrava", e.target.value)}
            className="rounded-md h-11"
            placeholder="Profile URL"
          />
        </div>

        {/* Website */}
        <div className="space-y-2">
          <Label htmlFor="website" className="text-sm font-medium text-gray-700">
            <div className="flex items-center gap-2">
              <ExternalLink className="h-4 w-4 text-gray-500" />
              Website
            </div>
          </Label>
          <Input
            id="website"
            value={localData.socialWebsite}
            onChange={(e) => updateField("socialWebsite", e.target.value)}
            className="rounded-md h-11"
            placeholder="https://..."
          />
        </div>
      </div>
    </SettingsBottomSheet>
  );
}

