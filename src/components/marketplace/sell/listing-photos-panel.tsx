"use client";

import * as React from "react";
import type { BikeDraft } from "@/app/marketplace/sell-redesign/_components/data";
import { uploadPhotos } from "@/app/marketplace/sell-redesign/_components/services";
import { PhotoUploader, Btn } from "@/app/marketplace/sell-redesign/_components/ui";

export type ListingPhotoDraft = Pick<BikeDraft, "images" | "uploadedImages">;

interface ListingPhotosPanelProps {
  draft: ListingPhotoDraft;
  onChange: (draft: ListingPhotoDraft) => void;
  onContinue: () => void;
}

export function ListingPhotosPanel({ draft, onChange, onContinue }: ListingPhotosPanelProps) {
  const [uploading, setUploading] = React.useState(false);

  const handleFiles = async (files: File[]) => {
    setUploading(true);
    try {
      const uploaded = await uploadPhotos(files);
      onChange({
        images: [...draft.images, ...uploaded.map((u) => u.url)],
        uploadedImages: [...(draft.uploadedImages ?? []), ...uploaded],
      });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-4">
      <PhotoUploader
        images={draft.images}
        onAdd={() => {}}
        onFiles={handleFiles}
        uploading={uploading}
        onRemove={(i) =>
          onChange({
            images: draft.images.filter((_, idx) => idx !== i),
            uploadedImages: (draft.uploadedImages ?? []).filter((_, idx) => idx !== i),
          })
        }
      />
      <Btn full disabled={draft.images.length === 0 || uploading} onClick={onContinue}>
        {draft.images.length ? "Continue" : "Add photos to continue"}
      </Btn>
    </div>
  );
}
