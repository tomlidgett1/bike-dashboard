export type CopyBatchFields = {
  title: boolean;
  description: boolean;
  specs: boolean;
  /** Short purchase-panel blurb distilled from the long description. */
  subDescription: boolean;
};

export type CopyBatchJobMetadata = {
  productIds: string[];
  copyFields: CopyBatchFields;
  bicycleOverrides: Record<string, boolean>;
  completedProductIds?: string[];
  failedProductIds?: string[];
};
