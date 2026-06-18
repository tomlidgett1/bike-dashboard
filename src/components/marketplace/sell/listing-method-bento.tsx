"use client";

import { Camera, LayoutList } from '@/components/layout/app-sidebar/dashboard-icons';
import { ListingBentoTile, ListingOrDivider } from "./listing-bento-tile";

interface ListingMethodBentoProps {
  onSelectGuided: () => void;
  onSelectQuickUpload: () => void;
  onSelectText: () => void;
  onSelectFacebook: () => void;
}

export function ListingMethodBento({
  onSelectGuided,
  onSelectQuickUpload,
  onSelectText,
  onSelectFacebook,
}: ListingMethodBentoProps) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2.5">
        <ListingBentoTile
          icon={Camera}
          label="Guided"
          line="One question at a time"
          onClick={onSelectGuided}
        />
        <ListingBentoTile
          icon={LayoutList}
          label="Quick upload"
          line="Every field on one page"
          onClick={onSelectQuickUpload}
        />
      </div>

      <ListingOrDivider />

      <div className="grid grid-cols-2 gap-2.5">
        <ListingBentoTile
          imageSrc="/imessage.png"
          label="Text us"
          line="Send photos over iMessage"
          onClick={onSelectText}
        />
        <ListingBentoTile
          imageSrc="/facebook.png"
          label="From Facebook"
          line="Import a Marketplace listing"
          onClick={onSelectFacebook}
        />
      </div>
    </div>
  );
}
