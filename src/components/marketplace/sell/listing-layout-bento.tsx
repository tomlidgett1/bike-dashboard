"use client";

import { Camera, LayoutList } from "lucide-react";
import { ListingBentoTile } from "./listing-bento-tile";

interface ListingLayoutBentoProps {
  onSelectGuided: () => void;
  onSelectQuickUpload: () => void;
}

export function ListingLayoutBento({ onSelectGuided, onSelectQuickUpload }: ListingLayoutBentoProps) {
  return (
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
  );
}
