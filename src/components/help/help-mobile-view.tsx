"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, ExternalLink } from "lucide-react";
import Link from "next/link";
import { HelpSearch } from "./help-search";
import { HelpQuickActions } from "./help-quick-actions";
import { HelpCategoryList } from "./help-category-list";
import { HelpArticleList } from "./help-article-list";
import { HelpArticleView } from "./help-article-view";
import { HelpContactCard } from "./help-contact-card";
import { HelpTicketPreview } from "./help-ticket-preview";
import type { HelpCategory, HelpArticle } from "@/lib/constants/help-content";
import { HELP_CATEGORIES, getArticlesByCategory, getCategoryById } from "@/lib/constants/help-content";

type MobileView = "home" | "category" | "article";

interface HelpMobileViewProps {
  initialCategory?: string;
  initialArticle?: string;
}

export function HelpMobileView({ initialCategory, initialArticle }: HelpMobileViewProps) {
  const router = useRouter();
  const [currentView, setCurrentView] = React.useState<MobileView>(
    initialArticle ? "article" : initialCategory ? "category" : "home"
  );
  const [selectedCategory, setSelectedCategory] = React.useState<HelpCategory | null>(
    initialCategory ? getCategoryById(initialCategory) || null : null
  );
  const [selectedArticle, setSelectedArticle] = React.useState<HelpArticle | null>(null);
  const [categoryArticles, setCategoryArticles] = React.useState<HelpArticle[]>([]);
  const [showContactSheet, setShowContactSheet] = React.useState(false);

  // Load category articles when category selected
  React.useEffect(() => {
    if (selectedCategory) {
      const articles = getArticlesByCategory(selectedCategory.id);
      setCategoryArticles(articles);
    }
  }, [selectedCategory]);

  // Categories with article counts
  const categoriesWithCounts = React.useMemo(() => {
    return HELP_CATEGORIES.map((cat) => ({
      ...cat,
      articleCount: getArticlesByCategory(cat.id).length,
    }));
  }, []);

  const handleCategoryClick = (category: HelpCategory) => {
    setSelectedCategory(category);
    setCurrentView("category");
  };

  const handleArticleClick = (article: HelpArticle) => {
    setSelectedArticle(article);
    setCurrentView("article");
  };

  const handleBack = () => {
    if (currentView === "article") {
      setCurrentView("category");
      setSelectedArticle(null);
    } else if (currentView === "category") {
      setCurrentView("home");
      setSelectedCategory(null);
    } else {
      router.back();
    }
  };

  const getHeaderTitle = () => {
    if (currentView === "article" && selectedArticle) {
      return selectedCategory?.title || "Article";
    }
    if (currentView === "category" && selectedCategory) {
      return selectedCategory.title;
    }
    return "Help & Support";
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Fixed Header */}
      <div className="sticky top-0 z-50 bg-white border-b border-gray-200">
        <div className="flex items-center justify-between px-4 py-3">
          <button
            type="button"
            onClick={handleBack}
            className="flex items-center gap-1 text-gray-600 -ml-2 p-2 rounded-md hover:bg-gray-100 active:bg-gray-200 transition-colors cursor-pointer"
          >
            <ChevronLeft className="h-5 w-5" />
            <span className="text-sm font-medium">
              {currentView === "home" ? "Back" : "Back"}
            </span>
          </button>

          <h1 className="text-base font-semibold text-gray-900 truncate max-w-[200px]">
            {getHeaderTitle()}
          </h1>

          <div className="w-16" /> {/* Spacer for alignment */}
        </div>
      </div>

      {/* Content */}
      <AnimatePresence mode="wait">
        {currentView === "home" && (
          <motion.div
            key="home"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            transition={{ duration: 0.2 }}
            className="pb-24"
          >
            {/* Search */}
            <div className="px-4 pt-4 pb-2">
              <HelpSearch />
            </div>

            {/* Quick Actions */}
            <div className="px-4 py-4">
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                Quick Actions
              </h2>
              <HelpQuickActions onContactClick={() => setShowContactSheet(true)} />
            </div>

            {/* Categories */}
            <div className="px-4 py-2">
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                Help Topics
              </h2>
              <HelpCategoryList
                categories={categoriesWithCounts}
                onCategoryClick={handleCategoryClick}
                variant="list"
              />
            </div>

            {/* My Tickets */}
            <div className="px-4 py-4">
              <HelpTicketPreview />
            </div>

            {/* Footer Links */}
            <div className="px-4 py-4 border-t border-gray-200 mt-4">
              <div className="flex flex-wrap justify-center gap-x-4 gap-y-2 text-xs text-gray-500">
                <Link href="/terms" className="hover:text-gray-700 flex items-center gap-1">
                  Terms of Service <ExternalLink className="h-3 w-3" />
                </Link>
                <Link href="/privacy" className="hover:text-gray-700 flex items-center gap-1">
                  Privacy Policy <ExternalLink className="h-3 w-3" />
                </Link>
                <Link href="/community" className="hover:text-gray-700 flex items-center gap-1">
                  Community Guidelines <ExternalLink className="h-3 w-3" />
                </Link>
              </div>
            </div>
          </motion.div>
        )}

        {currentView === "category" && selectedCategory && (
          <motion.div
            key="category"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
            className="pb-24 px-4 pt-4"
          >
            {/* Category Description */}
            <div className="mb-4">
              <p className="text-sm text-gray-600">{selectedCategory.description}</p>
            </div>

            {/* Articles */}
            <HelpArticleList
              articles={categoryArticles}
              onArticleClick={handleArticleClick}
            />

            {/* Contact Card */}
            <div className="mt-6">
              <HelpContactCard compact />
            </div>
          </motion.div>
        )}

        {currentView === "article" && selectedArticle && (
          <motion.div
            key="article"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
            className="pb-24 px-4 pt-4"
          >
            <HelpArticleView
              article={selectedArticle}
              category={selectedCategory || undefined}
              onBack={() => {
                setCurrentView("category");
                setSelectedArticle(null);
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Contact Sheet */}
      <AnimatePresence>
        {showContactSheet && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowContactSheet(false)}
              className="fixed inset-0 bg-black/50 z-50 cursor-pointer"
            />
            {/* Sheet */}
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-2xl pb-[env(safe-area-inset-bottom)]"
            >
              <div className="p-4">
                <div className="w-12 h-1.5 bg-gray-300 rounded-full mx-auto mb-4" />
                <HelpContactCard />
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

