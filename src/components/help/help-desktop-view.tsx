"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { HelpSearch } from "./help-search";
import { HelpCategoryList } from "./help-category-list";
import { HelpArticleList } from "./help-article-list";
import { HelpArticleView } from "./help-article-view";
import { HelpContactCard } from "./help-contact-card";
import { HelpTicketPreview } from "./help-ticket-preview";
import { HelpQuickActions } from "./help-quick-actions";
import type { HelpCategory, HelpArticle } from "@/lib/constants/help-content";
import {
  HELP_CATEGORIES,
  HELP_ARTICLES,
  getArticlesByCategory,
  getCategoryBySlug,
  getArticleBySlug,
  getPopularArticles,
} from "@/lib/constants/help-content";

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.4,
      ease: [0.04, 0.62, 0.23, 0.98] as [number, number, number, number],
    },
  },
};

interface HelpDesktopViewProps {
  categorySlug?: string;
  articleSlug?: string;
}

export function HelpDesktopView({ categorySlug, articleSlug }: HelpDesktopViewProps) {
  const router = useRouter();

  // Determine current view from props
  const currentCategory = categorySlug ? getCategoryBySlug(categorySlug) : null;
  const currentArticle = articleSlug ? getArticleBySlug(articleSlug) : null;
  const categoryArticles = currentCategory ? getArticlesByCategory(currentCategory.id) : [];

  // Categories with article counts
  const categoriesWithCounts = React.useMemo(() => {
    return HELP_CATEGORIES.map((cat) => ({
      ...cat,
      articleCount: getArticlesByCategory(cat.id).length,
    }));
  }, []);

  // Popular articles
  const popularArticles = React.useMemo(() => getPopularArticles(), []);

  // If viewing a single article
  if (currentArticle) {
    const articleCategory = HELP_CATEGORIES.find((c) => c.id === currentArticle.categoryId);
    
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <HelpArticleView
          article={currentArticle}
          category={articleCategory}
          onBack={() => {
            if (articleCategory) {
              router.push(`/marketplace/help/category/${articleCategory.slug}`);
            } else {
              router.push("/marketplace/help");
            }
          }}
        />
      </div>
    );
  }

  // If viewing a category
  if (currentCategory) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          {/* Header */}
          <motion.div variants={itemVariants} className="mb-6">
            <button
              onClick={() => router.push("/marketplace/help")}
              className="text-sm text-gray-600 hover:text-gray-900 mb-2"
            >
              ← Back to Help Centre
            </button>
            <h1 className="text-2xl font-bold text-gray-900">{currentCategory.title}</h1>
            <p className="text-gray-500 mt-1">{currentCategory.description}</p>
          </motion.div>

          {/* Articles */}
          <motion.div variants={itemVariants}>
            <HelpArticleList
              articles={categoryArticles}
              onArticleClick={(article) => router.push(`/marketplace/help/article/${article.slug}`)}
            />
          </motion.div>

          {/* Contact Card */}
          <motion.div variants={itemVariants} className="mt-8">
            <HelpContactCard />
          </motion.div>
        </motion.div>
      </div>
    );
  }

  // Default: Help Centre Home
  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        {/* Header */}
        <motion.div variants={itemVariants} className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">How can we help?</h1>
          <p className="text-gray-500">
            Search our help centre or browse topics below
          </p>
        </motion.div>

        {/* Search */}
        <motion.div variants={itemVariants} className="max-w-xl mx-auto mb-10">
          <HelpSearch autoFocus />
        </motion.div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left: Categories */}
          <div className="lg:col-span-2">
            {/* Quick Actions */}
            <motion.div variants={itemVariants} className="mb-8">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h2>
              <HelpQuickActions />
            </motion.div>

            {/* Popular Articles */}
            <motion.div variants={itemVariants} className="mb-8">
              <div className="flex items-center gap-2 mb-4">
                <Sparkles className="h-5 w-5 text-gray-400" />
                <h2 className="text-lg font-semibold text-gray-900">Popular Articles</h2>
              </div>
              <div className="bg-white rounded-md border border-gray-200 divide-y divide-gray-100">
                {popularArticles.map((article) => {
                  const category = HELP_CATEGORIES.find((c) => c.id === article.categoryId);
                  return (
                    <button
                      key={article.id}
                      onClick={() => router.push(`/marketplace/help/article/${article.slug}`)}
                      className="w-full flex items-center gap-3 p-4 text-left hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900">{article.title}</p>
                        <p className="text-xs text-gray-500">
                          {category?.title}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </motion.div>

            {/* Categories */}
            <motion.div variants={itemVariants}>
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Browse by Topic</h2>
              <HelpCategoryList
                categories={categoriesWithCounts}
                variant="card"
                onCategoryClick={(cat) => router.push(`/marketplace/help/category/${cat.slug}`)}
              />
            </motion.div>
          </div>

          {/* Right Sidebar */}
          <div className="space-y-6">
            {/* Tickets Preview */}
            <motion.div variants={itemVariants}>
              <HelpTicketPreview />
            </motion.div>

            {/* Contact Card */}
            <motion.div variants={itemVariants}>
              <HelpContactCard />
            </motion.div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
