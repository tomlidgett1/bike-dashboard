"use client";

import { Layers, Package } from "lucide-react";
import { ListingBentoTile } from "./listing-bento-tile";

interface ListingCountBentoProps {
  onSelectOneItem: () => void;
  onSelectBulk: () => void;
}

export function ListingCountBento({ onSelectOneItem, onSelectBulk }: ListingCountBentoProps) {
  return (
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
  );
}
