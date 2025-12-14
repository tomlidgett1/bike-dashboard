"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ThumbsUp, ThumbsDown, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { HelpArticle, HelpCategory } from "@/lib/constants/help-content";
import { HelpContactCard } from "./help-contact-card";

interface HelpArticleViewProps {
  article: HelpArticle;
  category?: HelpCategory;
  onBack?: () => void;
  className?: string;
}

export function HelpArticleView({
  article,
  category,
  onBack,
  className,
}: HelpArticleViewProps) {
  const router = useRouter();
  const [feedback, setFeedback] = React.useState<"helpful" | "not_helpful" | null>(null);
  const [showFeedbackThanks, setShowFeedbackThanks] = React.useState(false);

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else if (category) {
      router.push(`/marketplace/help/category/${category.slug}`);
    } else {
      router.push("/marketplace/help");
    }
  };

  const handleFeedback = (type: "helpful" | "not_helpful") => {
    setFeedback(type);
    setShowFeedbackThanks(true);
    // Could send analytics here
  };

  // Parse markdown-like content to simple HTML
  const renderContent = (content: string) => {
    const lines = content.split("\n");
    const elements: React.ReactNode[] = [];
    let inList = false;
    let listItems: string[] = [];

    const flushList = () => {
      if (listItems.length > 0) {
        elements.push(
          <ul key={`list-${elements.length}`} className="list-disc list-inside space-y-1 text-gray-700 text-sm mb-4">
            {listItems.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        );
        listItems = [];
      }
      inList = false;
    };

    lines.forEach((line, index) => {
      const trimmed = line.trim();

      // Headers
      if (trimmed.startsWith("### ")) {
        flushList();
        elements.push(
          <h4 key={index} className="text-sm font-semibold text-gray-900 mt-5 mb-2">
            {trimmed.slice(4)}
          </h4>
        );
      } else if (trimmed.startsWith("## ")) {
        flushList();
        elements.push(
          <h3 key={index} className="text-base font-semibold text-gray-900 mt-6 mb-3">
            {trimmed.slice(3)}
          </h3>
        );
      }
      // List items
      else if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
        inList = true;
        listItems.push(trimmed.slice(2));
      }
      // Numbered list items
      else if (/^\d+\.\s/.test(trimmed)) {
        if (!inList) {
          flushList();
        }
        inList = true;
        listItems.push(trimmed.replace(/^\d+\.\s/, ""));
      }
      // Bold text
      else if (trimmed.startsWith("**") && trimmed.endsWith("**")) {
        flushList();
        elements.push(
          <p key={index} className="text-sm font-semibold text-gray-900 mt-4 mb-1">
            {trimmed.slice(2, -2)}
          </p>
        );
      }
      // Regular paragraph
      else if (trimmed.length > 0) {
        flushList();
        // Handle inline bold
        const parts = trimmed.split(/(\*\*[^*]+\*\*)/g);
        elements.push(
          <p key={index} className="text-sm text-gray-700 mb-3 leading-relaxed">
            {parts.map((part, i) => {
              if (part.startsWith("**") && part.endsWith("**")) {
                return <strong key={i} className="font-semibold">{part.slice(2, -2)}</strong>;
              }
              return part;
            })}
          </p>
        );
      }
    });

    flushList();
    return elements;
  };

  return (
    <div className={cn("", className)}>
      {/* Header */}
      <div className="mb-6">
        <button
          onClick={handleBack}
          className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 mb-4 cursor-pointer"
        >
          <ArrowLeft className="h-4 w-4" />
          {category ? category.title : "Back to Help Centre"}
        </button>
        <h1 className="text-xl font-bold text-gray-900 mb-2">{article.title}</h1>
        <p className="text-sm text-gray-500">{article.description}</p>
      </div>

      {/* Article Content */}
      <div className="bg-white rounded-md border border-gray-200 p-5 sm:p-6 mb-6">
        <div className="prose prose-sm max-w-none">
          {renderContent(article.content)}
        </div>
      </div>

      {/* Feedback Section */}
      <div className="bg-white rounded-md border border-gray-200 p-5 mb-6">
        {showFeedbackThanks ? (
          <div className="text-center py-2">
            <p className="text-sm font-medium text-gray-900">Thanks for your feedback!</p>
            <p className="text-xs text-gray-500 mt-1">
              {feedback === "helpful"
                ? "We're glad this article helped."
                : "We'll work on improving this article."}
            </p>
          </div>
        ) : (
          <>
            <p className="text-sm font-medium text-gray-900 text-center mb-3">
              Was this article helpful?
            </p>
            <div className="flex justify-center gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleFeedback("helpful")}
                className="rounded-md"
              >
                <ThumbsUp className="h-4 w-4 mr-1.5" />
                Yes
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleFeedback("not_helpful")}
                className="rounded-md"
              >
                <ThumbsDown className="h-4 w-4 mr-1.5" />
                No
              </Button>
            </div>
          </>
        )}
      </div>

      {/* Still Need Help */}
      <HelpContactCard compact />
    </div>
  );
}
