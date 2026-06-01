"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SettingsBottomSheet } from "./settings-bottom-sheet";


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
          <Label htmlFor="instagram" className="text-xs font-medium text-muted-foreground">Instagram</Label>
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
          <Label htmlFor="facebook" className="text-xs font-medium text-muted-foreground">Facebook</Label>
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
          <Label htmlFor="strava" className="text-xs font-medium text-muted-foreground">Strava</Label>
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
          <Label htmlFor="website" className="text-xs font-medium text-muted-foreground">Website</Label>
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





