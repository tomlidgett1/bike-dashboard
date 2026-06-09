export type CopyBatchFields = {
  title: boolean;
  description: boolean;
  specs: boolean;
};

export type CopyBatchJobMetadata = {
  productIds: string[];
  copyFields: CopyBatchFields;
  bicycleOverrides: Record<string, boolean>;
  completedProductIds?: string[];
  failedProductIds?: string[];
};
