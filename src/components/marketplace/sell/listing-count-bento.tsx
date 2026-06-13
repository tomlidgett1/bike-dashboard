"use client";

import { Layers, Package } from "lucide-react";
import { ListingBentoTile, ListingOrDivider } from "./listing-bento-tile";

interface ListingCountBentoProps {
  onSelectOneItem: () => void;
  onSelectBulk: () => void;
  onSelectText: () => void;
  onSelectFacebook: () => void;
}

export function ListingCountBento({
  onSelectOneItem,
  onSelectBulk,
  onSelectText,
  onSelectFacebook,
}: ListingCountBentoProps) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2.5">
        <ListingBentoTile
          icon={Package}
          label="One item"
          line="A bike, part or accessory"
          onClick={onSelectOneItem}
        />
        <ListingBentoTile
          icon={Layers}
          label="Bulk"
          line="Several items — AI sorts photos"
          onClick={onSelectBulk}
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
