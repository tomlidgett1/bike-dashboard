// ============================================================
// Help Search API Route
// ============================================================
// GET: Search help articles and FAQs

import { NextRequest, NextResponse } from 'next/server';
import {
  HELP_ARTICLES,
  HELP_CATEGORIES,
  searchArticles,
} from '@/lib/constants/help-content';

// ============================================================
// Types
// ============================================================

interface SearchResult {
  type: 'article' | 'faq';
  id: string;
  title: string;
  description: string;
  categoryId?: string;
  categoryName?: string;
  slug?: string;
}

// ============================================================
// GET: Search articles and FAQs
// ============================================================

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const query = searchParams.get('q')?.trim();

  if (!query || query.length < 2) {
    return NextResponse.json({
      results: [],
      message: 'Please enter at least 2 characters to search',
    });
  }

  const lowerQuery = query.toLowerCase();

  // Search articles
  const articleResults: SearchResult[] = HELP_ARTICLES
    .filter((article) => {
      const searchText = [
        article.title,
        article.description,
        ...article.keywords,
        article.content,
      ].join(' ').toLowerCase();
      
      return searchText.includes(lowerQuery);
    })
    .slice(0, 8)
    .map((article) => {
      const category = HELP_CATEGORIES.find((c) => c.id === article.categoryId);
      return {
        type: 'article' as const,
        id: article.id,
        title: article.title,
        description: article.description,
        categoryId: article.categoryId,
        categoryName: category?.title,
        slug: article.slug,
      };
    });

  // Return combined results
  return NextResponse.json({
    results: articleResults,
    query,
    totalResults: articleResults.length,
  });
}
