"use client";

import * as React from "react";
import Image from "next/image";
import { User, MapPin, Camera, FileText, Upload, Loader2, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { SettingsBottomSheet } from "./settings-bottom-sheet";
import { optimizeImage, formatFileSize } from "@/lib/utils/image-optimizer";
import { createClient } from "@/lib/supabase/client";

interface ProfileFormData {
  firstName: string;
  lastName: string;
  sellerDisplayName: string;
  bio: string;
  location: string;
  logoUrl: string;
}

interface EditProfileSheetProps {
  isOpen: boolean;
  onClose: () => void;
  formData: ProfileFormData;
  onSave: (data: ProfileFormData) => void;
  saving?: boolean;
  userId?: string;
}

export function EditProfileSheet({
  isOpen,
  onClose,
  formData,
  onSave,
  saving = false,
  userId,
}: EditProfileSheetProps) {
  const [localData, setLocalData] = React.useState<ProfileFormData>(formData);
  const [uploadingPhoto, setUploadingPhoto] = React.useState(false);
  const [photoPreview, setPhotoPreview] = React.useState<string | null>(null);
  const [uploadError, setUploadError] = React.useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // Sync when sheet opens
  React.useEffect(() => {
    if (isOpen) {
      setLocalData(formData);
      setPhotoPreview(formData.logoUrl || null);
      setUploadError(null);
    }
  }, [isOpen, formData]);

  const handleSave = () => {
    onSave(localData);
  };

  const updateField = (field: keyof ProfileFormData, value: string) => {
    setLocalData((prev) => ({ ...prev, [field]: value }));
  };

  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !userId) return;

    try {
      setUploadError(null);
      
      // Validate file type
      if (!file.type.startsWith("image/")) {
        setUploadError("Please select an image file");
        return;
      }

      // Validate file size (max 5MB for original)
      if (file.size > 5 * 1024 * 1024) {
        setUploadError("Image must be less than 5MB");
        return;
      }

      setUploadingPhoto(true);

      // Optimise image (resize to 512x512, convert to WebP)
      const optimizedBlob = await optimizeImage(file, {
        maxWidth: 512,
        maxHeight: 512,
        quality: 0.85,
        format: "webp",
      });

      // Create File from Blob
      const optimizedFile = new File(
        [optimizedBlob],
        file.name.replace(/\.[^/.]+$/, ".webp"),
        { type: "image/webp" }
      );

      console.log("Image optimised:", {
        original: formatFileSize(file.size),
        optimised: formatFileSize(optimizedFile.size),
        savings: `${Math.round((1 - optimizedFile.size / file.size) * 100)}%`,
      });

      // Upload to Supabase storage
      const supabase = createClient();

      // Delete old logo if exists
      if (localData.logoUrl && localData.logoUrl.includes("supabase")) {
        const oldFileName = localData.logoUrl.split("/").pop();
        if (oldFileName) {
          await supabase.storage.from("logo").remove([`${userId}/${oldFileName}`]);
        }
      }

      // Upload new image
      const fileName = `${Date.now()}.webp`;
      const filePath = `${userId}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from("logo")
        .upload(filePath, optimizedFile, {
          cacheControl: "31536000",
          upsert: false,
          contentType: "image/webp",
        });

      if (uploadError) {
        throw uploadError;
      }

      // Get public URL
      const {
        data: { publicUrl },
      } = supabase.storage.from("logo").getPublicUrl(filePath);

      // Update local state
      setPhotoPreview(publicUrl);
      setLocalData((prev) => ({ ...prev, logoUrl: publicUrl }));
    } catch (error) {
      console.error("Error uploading photo:", error);
      setUploadError("Failed to upload photo. Please try again.");
    } finally {
      setUploadingPhoto(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleRemovePhoto = () => {
    setPhotoPreview(null);
    setLocalData((prev) => ({ ...prev, logoUrl: "" }));
  };

  const displayName =
    localData.sellerDisplayName ||
    `${localData.firstName} ${localData.lastName}`.trim() ||
    "?";

  return (
    <SettingsBottomSheet
      isOpen={isOpen}
      onClose={onClose}
      title="Edit Profile"
      onSave={handleSave}
      saving={saving}
    >
      <div className="space-y-5">
        {/* Name Row */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="firstName" className="text-sm font-medium text-gray-700">
              First Name
            </Label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                id="firstName"
                value={localData.firstName}
                onChange={(e) => updateField("firstName", e.target.value)}
                className="pl-10 rounded-md h-11"
                placeholder="First"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="lastName" className="text-sm font-medium text-gray-700">
              Last Name
            </Label>
            <Input
              id="lastName"
              value={localData.lastName}
              onChange={(e) => updateField("lastName", e.target.value)}
              className="rounded-md h-11"
              placeholder="Last"
            />
          </div>
        </div>

        {/* Display Name */}
        <div className="space-y-2">
          <Label htmlFor="displayName" className="text-sm font-medium text-gray-700">
            Display Name
          </Label>
          <Input
            id="displayName"
            value={localData.sellerDisplayName}
            onChange={(e) => updateField("sellerDisplayName", e.target.value)}
            className="rounded-md h-11"
            placeholder="e.g. MTB Enthusiast, John's Bikes"
          />
          <p className="text-xs text-gray-500">
            Optional custom name shown on your seller profile
          </p>
        </div>

        {/* Bio */}
        <div className="space-y-2">
          <Label htmlFor="bio" className="text-sm font-medium text-gray-700">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-gray-400" />
              Bio
            </div>
          </Label>
          <Textarea
            id="bio"
            value={localData.bio}
            onChange={(e) => updateField("bio", e.target.value)}
            className="rounded-md min-h-[100px] resize-none"
            placeholder="Tell other cyclists about yourself..."
            maxLength={500}
          />
          <p className="text-xs text-gray-500 text-right">
            {localData.bio.length}/500
          </p>
        </div>

        {/* Location */}
        <div className="space-y-2">
          <Label htmlFor="location" className="text-sm font-medium text-gray-700">
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-gray-400" />
              Location
            </div>
          </Label>
          <Input
            id="location"
            value={localData.location}
            onChange={(e) => updateField("location", e.target.value)}
            className="rounded-md h-11"
            placeholder="e.g. Sydney, NSW"
          />
        </div>

        {/* Profile Photo */}
        <div className="space-y-3">
          <Label className="text-sm font-medium text-gray-700">
            <div className="flex items-center gap-2">
              <Camera className="h-4 w-4 text-gray-400" />
              Profile Photo
            </div>
          </Label>

          {/* Photo Preview and Upload */}
          <div className="flex items-center gap-4">
            {/* Preview */}
            <div className="relative flex-shrink-0">
              <div className="h-20 w-20 rounded-full border-2 border-gray-200 bg-gray-100 overflow-hidden">
                {photoPreview ? (
                  <Image
                    src={photoPreview}
                    alt="Profile preview"
                    width={80}
                    height={80}
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
              {photoPreview && (
                <button
                  type="button"
                  onClick={handleRemovePhoto}
                  className="absolute -top-1 -right-1 h-6 w-6 rounded-full bg-red-500 text-white flex items-center justify-center hover:bg-red-600 active:bg-red-700 transition-colors shadow-sm"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* Upload Button */}
            <div className="flex-1 space-y-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handlePhotoSelect}
                className="hidden"
                aria-label="Upload profile photo"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingPhoto || !userId}
                className="rounded-md w-full h-10"
              >
                {uploadingPhoto ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <Upload className="mr-2 h-4 w-4" />
                    Upload Photo
                  </>
                )}
              </Button>
              <p className="text-xs text-gray-500">
                JPG, PNG or WebP, max 5MB
              </p>
            </div>
          </div>

          {/* Error message */}
          {uploadError && (
            <p className="text-xs text-red-600">{uploadError}</p>
          )}

          {/* OR paste URL */}
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-gray-200" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-white px-2 text-gray-500">or paste URL</span>
            </div>
          </div>

          <Input
            id="logoUrl"
            value={localData.logoUrl}
            onChange={(e) => {
              updateField("logoUrl", e.target.value);
              setPhotoPreview(e.target.value || null);
            }}
            className="rounded-md h-10 text-sm"
            placeholder="https://example.com/photo.jpg"
          />
        </div>
      </div>
    </SettingsBottomSheet>
  );
}

