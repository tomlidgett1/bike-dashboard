// ============================================================
// Help Articles API Route
// ============================================================
// GET: Get help articles by category or slug

import { NextRequest, NextResponse } from 'next/server';
import {
  HELP_CATEGORIES,
  HELP_ARTICLES,
  getCategoryBySlug,
  getArticlesByCategory,
  getArticleBySlug,
  getPopularArticles,
} from '@/lib/constants/help-content';

// ============================================================
// GET: Get articles
// ============================================================

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const categorySlug = searchParams.get('category');
  const articleSlug = searchParams.get('article');
  const popular = searchParams.get('popular');

  // Return single article by slug
  if (articleSlug) {
    const article = getArticleBySlug(articleSlug);
    if (!article) {
      return NextResponse.json(
        { error: 'Article not found' },
        { status: 404 }
      );
    }
    return NextResponse.json({ article });
  }

  // Return popular articles
  if (popular === 'true') {
    const articles = getPopularArticles();
    return NextResponse.json({ articles });
  }

  // Return articles by category
  if (categorySlug) {
    const category = getCategoryBySlug(categorySlug);
    if (!category) {
      return NextResponse.json(
        { error: 'Category not found' },
        { status: 404 }
      );
    }
    const articles = getArticlesByCategory(category.id);
    return NextResponse.json({ category, articles });
  }

  // Return all categories with article counts
  const categories = HELP_CATEGORIES.map((category) => ({
    ...category,
    articleCount: HELP_ARTICLES.filter((a) => a.categoryId === category.id).length,
  }));

  return NextResponse.json({ categories });
}

