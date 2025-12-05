// ============================================================
// Image Matching Types
// ============================================================

export interface MatchResult {
  canonicalProductId: string | null;
  confidence: number;
  matchType: 'upc_exact' | 'name_fuzzy' | 'none';
  requiresReview: boolean;
  suggestedMatches?: CanonicalProductMatch[];
}

export interface CanonicalProductMatch {
  id: string;
  upc: string;
  normalizedName: string;
  category: string | null;
  manufacturer: string | null;
  imageCount: number;
  confidence: number;
}

export interface ProductToMatch {
  id: string;
  upc: string | null;
  description: string;
  categoryName: string | null;
  manufacturerName: string | null;
}

export interface MatchQueueItem {
  id: string;
  productId: string;
  userId: string;
  upc: string | null;
  productName: string;
  category: string | null;
  manufacturer: string | null;
  status: 'pending' | 'matched' | 'manual_review' | 'completed' | 'failed';
  matchConfidence: number | null;
  matchType: string | null;
  suggestedCanonicalId: string | null;
  attempts: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCanonicalProductInput {
  upc: string;
  normalizedName: string;
  category?: string | null;
  manufacturer?: string | null;
  modelYear?: string | null;
}







