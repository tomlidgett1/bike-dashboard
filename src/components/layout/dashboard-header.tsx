"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { FloatingTomFeedbackButton } from "@/components/feedback/floating-tom-feedback-button";
import { StoreSettingsGenieSearch } from "@/components/layout/store-settings-genie-search";
import { TopbarUserMenu } from "@/components/layout/topbar-user-menu";
import { TopbarViewStoreButton } from "@/components/layout/topbar-view-store-button";
import { HeaderSidebarTrigger } from "@/components/layout/app-sidebar/sidebar-collapse-trigger";
import { DashboardHeaderColorPicker } from "@/components/layout/dashboard-header-color";
import { NotificationsDropdown } from "./notifications-dropdown";
import { MessagesDropdown } from "./messages-dropdown";
import { NestMessagesDropdown } from "./nest-messages-dropdown";
import { StoreSetupButton } from "@/components/settings/store-setup-button";
import { useAuth } from "@/components/providers/auth-provider";
import { dashboardHorizontalPadding } from "@/lib/layout/dashboard-padding";
import {
  isStoreDashboardPath,
  isStoreSettingsPath,
} from "@/lib/routes/store-dashboard";
import { cn } from "@/lib/utils";

function useDeferredHeaderActions() {
  const [ready, setReady] = React.useState(false);

  React.useEffect(() => {
    const win = window as Window & {
      requestIdleCallback?: (
        cb: IdleRequestCallback,
        options?: IdleRequestOptions,
      ) => number;
      cancelIdleCallback?: (id: number) => void;
    };

    if (win.requestIdleCallback) {
      const id = win.requestIdleCallback(() => setReady(true), {
        timeout: 1200,
      });
      return () => win.cancelIdleCallback?.(id);
    }

    const id = window.setTimeout(() => setReady(true), 800);
    return () => window.clearTimeout(id);
  }, []);

  return ready;
}

export function DashboardHeader() {
  const pathname = usePathname() ?? "/products";
  const showStoreActions = isStoreDashboardPath(pathname);
  const isStoreSettings = isStoreSettingsPath(pathname);
  const { user } = useAuth();
  const showDeferredActions = useDeferredHeaderActions();

  return (
    <header
      data-store-settings-header={isStoreSettings ? "" : undefined}
      className={cn(
        "dashboard-header z-40 flex h-14 shrink-0 items-center gap-3 text-[color:var(--dashboard-header-fg)]",
        dashboardHorizontalPadding,
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        <div className="shrink-0 md:hidden">
          <HeaderSidebarTrigger />
        </div>
        <Link
          href="/marketplace"
          aria-label="Yellow Jersey marketplace"
          className="flex shrink-0 items-center transition-opacity hover:opacity-85"
        >
          <Image
            src="/yjlogo.svg"
            alt="Yellow Jersey"
            width={180}
            height={28}
            className="h-7 w-auto sm:h-8"
            priority
          />
        </Link>
      </div>

      {isStoreSettings ? (
        <div className="flex min-w-0 flex-1 justify-center px-1.5 sm:px-2">
          <StoreSettingsGenieSearch className="max-w-[min(100%,36rem)]" />
        </div>
      ) : null}

      <div className={cn("flex items-center gap-1.5 sm:gap-2", isStoreSettings ? "shrink-0" : "ml-auto")}>
        <DashboardHeaderColorPicker />
        {showStoreActions ? <FloatingTomFeedbackButton placement="header" /> : null}

        {showDeferredActions ? (
          <>
            {showStoreActions ? (
              <>
                <StoreSetupButton iconOnly />
                <TopbarViewStoreButton />
                {user ? <NestMessagesDropdown /> : null}
              </>
            ) : null}
            {user ? <NotificationsDropdown /> : null}
            {user ? <MessagesDropdown /> : null}
            {user ? <TopbarUserMenu /> : null}
          </>
        ) : null}
      </div>
    </header>
  );
}
