"use client";

import * as React from "react";
import { PageHeader } from "@/components/dashboard";

interface HeaderProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Optional primary actions rendered on the right of the title. */
  actions?: React.ReactNode;
}

/**
 * Page title block. The global chrome (sidebar trigger, breadcrumb, sync,
 * notifications, theme) now lives in the dashboard <Topbar>, so this simply
 * renders the standardized page heading inside the content area. Existing pages
 * that call <Header title=… /> get the new look automatically.
 */
export function Header({ title, description, actions }: HeaderProps) {
  return (
    <div className="px-4 pt-6 lg:px-8 lg:pt-8">
      <PageHeader title={title} description={description} actions={actions} />
    </div>
  );
}
