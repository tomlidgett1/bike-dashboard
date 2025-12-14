"use client";

import * as React from "react";
import { HelpMobileView } from "./help-mobile-view";
import { HelpDesktopView } from "./help-desktop-view";

interface HelpPageProps {
  categorySlug?: string;
  articleSlug?: string;
}

export function HelpPage({ categorySlug, articleSlug }: HelpPageProps) {
  return (
    <>
      {/* Mobile View */}
      <div className="lg:hidden">
        <HelpMobileView
          initialCategory={categorySlug}
          initialArticle={articleSlug}
        />
      </div>

      {/* Desktop View */}
      <div className="hidden lg:block min-h-screen bg-gray-50 pt-16">
        <HelpDesktopView
          categorySlug={categorySlug}
          articleSlug={articleSlug}
        />
      </div>
    </>
  );
}
