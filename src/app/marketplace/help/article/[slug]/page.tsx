"use client";

import { useParams, useRouter } from "next/navigation";
import { MarketplaceHeader } from "@/components/marketplace/marketplace-header";
import { HelpArticleView } from "@/components/help/help-article-view";
import { getArticleBySlug, getCategoryById, HELP_CATEGORIES } from "@/lib/constants/help-content";

export default function HelpArticlePage() {
  const params = useParams();
  const router = useRouter();
  const slug = params.slug as string;

  const article = getArticleBySlug(slug);
  const category = article ? HELP_CATEGORIES.find((c) => c.id === article.categoryId) : undefined;

  if (!article) {
    return (
      <>
        <div className="hidden lg:block">
          <MarketplaceHeader showFloatingButton={false} />
        </div>
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <div className="text-center">
            <h1 className="text-xl font-semibold text-gray-900 mb-2">Article not found</h1>
            <p className="text-gray-500 mb-4">The article you're looking for doesn't exist.</p>
            <button
              onClick={() => router.push("/marketplace/help")}
              className="text-gray-700 hover:text-gray-900 font-medium cursor-pointer"
            >
              ← Back to Help Centre
            </button>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      {/* Desktop: Show header */}
      <div className="hidden lg:block">
        <MarketplaceHeader showFloatingButton={false} />
      </div>

      {/* Mobile View */}
      <div className="lg:hidden min-h-screen bg-gray-50">
        <div className="sticky top-0 z-50 bg-white border-b border-gray-200">
          <div className="flex items-center px-4 py-3">
            <button
              onClick={() => {
                if (category) {
                  router.push(`/marketplace/help/category/${category.slug}`);
                } else {
                  router.push("/marketplace/help");
                }
              }}
              className="flex items-center gap-1 text-gray-600 cursor-pointer"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              <span className="text-sm font-medium">Back</span>
            </button>
          </div>
        </div>
        <div className="px-4 py-4 pb-24">
          <HelpArticleView article={article} category={category} />
        </div>
      </div>

      {/* Desktop View */}
      <div className="hidden lg:block min-h-screen bg-gray-50 pt-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <HelpArticleView
            article={article}
            category={category}
            onBack={() => {
              if (category) {
                router.push(`/marketplace/help/category/${category.slug}`);
              } else {
                router.push("/marketplace/help");
              }
            }}
          />
        </div>
      </div>
    </>
  );
}
