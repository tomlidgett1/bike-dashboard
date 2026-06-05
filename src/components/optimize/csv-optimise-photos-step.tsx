"use client";

import { StoreOnlineProductsManager } from "@/components/settings/store-online-products-manager";
import type { CsvPhotosPayload } from "@/components/settings/store-online-products-csv-panel";

export function CsvOptimisePhotosStep({
  payload,
  onComplete,
}: {
  payload: CsvPhotosPayload;
  onComplete: () => void;
}) {
  return (
    <StoreOnlineProductsManager
      csvPhotosSeed={payload}
      onCsvPhotosComplete={onComplete}
    />
  );
}
