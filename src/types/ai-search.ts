// ============================================================
// AI Search Types
// TypeScript interfaces for AI cycling expert search responses
// ============================================================

export interface AISearchResponse {
  introduction: string;
  keyPoints: string[];
  specifications?: Array<{ label: string; value: string }>;
  recommendations?: string[];
  sources: Array<{ url: string; title: string; domain: string }>;
}

export interface AISearchResult {
  success: boolean;
  response: AISearchResponse;
  query: string;
  meta?: {
    model?: string;
    tokensUsed?: number;
  };
}

export interface AISearchError {
  success: false;
  error: string;
  details?: string;
}







