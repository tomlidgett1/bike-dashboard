"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import type { HelpArticle } from "@/lib/constants/help-content";

interface HelpArticleListProps {
  articles: HelpArticle[];
  categoryTitle?: string;
  onArticleClick?: (article: HelpArticle) => void;
  className?: string;
}

export function HelpArticleList({
  articles,
  categoryTitle,
  onArticleClick,
  className,
}: HelpArticleListProps) {
  const router = useRouter();

  const handleClick = (article: HelpArticle) => {
    if (onArticleClick) {
      onArticleClick(article);
    } else {
      router.push(`/marketplace/help/article/${article.slug}`);
    }
  };

  if (articles.length === 0) {
    return (
      <div className={cn("bg-white rounded-md border border-gray-200 p-8 text-center", className)}>
        <FileText className="h-8 w-8 text-gray-300 mx-auto mb-3" />
        <p className="text-sm text-gray-500">No articles found in this category</p>
      </div>
    );
  }

  return (
    <div className={cn("space-y-2", className)}>
      {categoryTitle && (
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider px-1 mb-3">
          {categoryTitle}
        </h3>
      )}
      <div className="bg-white rounded-md border border-gray-200 divide-y divide-gray-100">
        {articles.map((article) => (
          <button
            key={article.id}
            onClick={() => handleClick(article)}
            className="w-full flex items-center gap-3 p-4 text-left hover:bg-gray-50 active:bg-gray-100 transition-colors"
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900">{article.title}</p>
              <p className="text-xs text-gray-500 line-clamp-1 mt-0.5">
                {article.description}
              </p>
            </div>
            <ChevronRight className="h-5 w-5 text-gray-400 flex-shrink-0" />
          </button>
        ))}
      </div>
    </div>
  );
}
