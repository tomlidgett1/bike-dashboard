"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import {
  Archive,
  ChatRound,
  Inbox,
  Loader2,
  Mail,
  RefreshCw,
  Search,
  Send,
  UserX,
} from "@/components/layout/app-sidebar/dashboard-icons";
import { GmailLogo } from "@/components/genie/gmail-logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  CustomerEnquiriesPageHeader,
  storeSettingsHeaderActionClass,
} from "@/components/settings/actions-page-header";
import { EnquiriesNavTabs } from "@/components/settings/customer-inquiries/enquiries-nav-tabs";
import { EnquiryConversationList } from "@/components/settings/customer-inquiries/enquiry-conversation-list";
import { EnquiryConversationPane } from "@/components/settings/customer-inquiries/enquiry-conversation-pane";
import {
  INBOX_SOURCE_TABS,
  INBOX_STATUS_TABS,
  useUnifiedInboxController,
  type UnifiedInboxController,
} from "@/components/settings/customer-inquiries/use-unified-inbox-controller";
import {
  FloatingCard,
  FloatingCardPageBody,
  FloatingCardPageHeader,
  FloatingCardPageTitleRow,
} from "@/components/layout/floating-card-page";
import { floatingCardPageHeaderNudgeClass } from "@/lib/layout/floating-card-page";
import { cn } from "@/lib/utils";

function InquiriesGmailStatusLoading() {
  return (
    <InquiriesFloatingCardShell>
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading enquiries…
        </div>
      </div>
    </InquiriesFloatingCardShell>
  );
}

function InquiriesFloatingCardShell({
  headerActions,
  children,
}: {
  headerActions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <>
      <FloatingCardPageHeader>
        {headerActions ?? (
          <FloatingCardPageTitleRow title="Customer enquiries" icon={Inbox} />
        )}
      </FloatingCardPageHeader>

      <FloatingCardPageBody>
        <FloatingCard>{children}</FloatingCard>
      </FloatingCardPageBody>
    </>
  );
}

function CustomerEnquiriesHeader({
  c,
  trailingActions,
}: {
  c: UnifiedInboxController;
  trailingActions?: ReactNode;
}) {
  return (
    <CustomerEnquiriesPageHeader
      className={cn(floatingCardPageHeaderNudgeClass, "!static !pb-0")}
      composeDisabled={!c.nestConfigured}
      onMessageStarted={c.handleNestStarted}
      trailingActions={trailingActions}
    />
  );
}

function CustomerEnquiriesFilterBar({
  c,
  onCloseAll,
}: {
  c: UnifiedInboxController;
  onCloseAll: () => void;
}) {
  const statusItems = INBOX_STATUS_TABS.map((tab) => ({
    ...tab,
    count: c.statusCounts[tab.id],
  }));

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2.5 rounded-t-xl border-b border-border/60 bg-gray-50 px-4 py-3 md:px-5">
      <EnquiriesNavTabs items={statusItems} value={c.statusTab} onChange={c.setStatusTab} />
      {c.needsActionCount > 0 ? (
        <button
          type="button"
          onClick={onCloseAll}
          disabled={c.closingCases}
          className={cn(
            "relative ml-auto inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-gray-200/80 bg-white px-3.5 py-1.5 text-sm font-medium text-gray-800 shadow-sm transition-colors hover:bg-gray-50",
            c.closingCases && "cursor-not-allowed opacity-50 hover:bg-white",
          )}
        >
          {c.closingCases ? (
            <Loader2 className="size-[15px] shrink-0 animate-spin" />
          ) : (
            <Archive className="size-[15px] shrink-0" />
          )}
          Close all
          <span className="rounded-full bg-gray-100 px-1.5 py-0 text-[10px] font-semibold tabular-nums text-gray-600">
            {c.needsActionCount}
          </span>
        </button>
      ) : null}
    </div>
  );
}

function EnquiriesSplitView({ c }: { c: UnifiedInboxController }) {
  const hasSelection = Boolean(c.selectedKey && c.selectedRow);
  const sourceItems = INBOX_SOURCE_TABS.map((tab) => ({
    ...tab,
    count: c.sourceCounts[tab.id],
  }));

  return (
    <div className="flex min-h-0 flex-1">
      <div
        className={cn(
          "w-full min-w-0 flex-col md:flex md:w-[340px] md:shrink-0 md:border-r md:border-border/60 lg:w-[380px]",
          hasSelection ? "hidden" : "flex",
        )}
      >
        <div className="shrink-0 space-y-2 border-b border-gray-100 px-3 py-2.5">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
            <Input
              type="search"
              value={c.searchQuery}
              onChange={(event) => c.setSearchQuery(event.target.value)}
              placeholder="Search name, email, subject…"
              className="h-8 rounded-md border-gray-200 bg-white pl-8 text-sm"
            />
          </div>
          <EnquiriesNavTabs
            size="sm"
            items={sourceItems}
            value={c.sourceTab}
            onChange={c.setSourceTab}
          />
        </div>
        <EnquiryConversationList c={c} />
      </div>
      <div
        className={cn(
          "min-w-0 flex-1 flex-col md:flex",
          hasSelection ? "flex" : "hidden",
        )}
      >
        <EnquiryConversationPane c={c} />
      </div>
    </div>
  );
}

function CustomerEnquiriesHeaderActions({ c }: { c: UnifiedInboxController }) {
  return (
    <>
      <Link
        href="/settings/store/nest"
        className={storeSettingsHeaderActionClass()}
      >
        <ChatRound className="size-[15px]" />
        Nest
      </Link>
      {c.gmailConfigured && !c.gmailConnected ? (
        <button
          type="button"
          onClick={() => void c.handleConnectGmail()}
          disabled={c.connecting}
          className={storeSettingsHeaderActionClass(false, c.connecting)}
        >
          {c.connecting ? (
            <Loader2 className="size-[15px] animate-spin" />
          ) : (
            <Mail className="size-[15px]" />
          )}
          Connect Gmail
        </button>
      ) : null}
      <button
        type="button"
        onClick={() => void c.handleRefreshAll()}
        disabled={c.refreshing}
        className={storeSettingsHeaderActionClass(false, c.refreshing)}
      >
        {c.refreshing ? (
          <Loader2 className="size-[15px] animate-spin" />
        ) : (
          <RefreshCw className="size-[15px]" />
        )}
        Refresh
      </button>
    </>
  );
}

export function StoreCustomerInquiriesPanel() {
  const c = useUnifiedInboxController();
  const [closeAllOpen, setCloseAllOpen] = useState(false);

  if (!c.gmailStatusReady) {
    if (c.loading) {
      return <InquiriesGmailStatusLoading />;
    }
    if (c.error) {
      return (
        <InquiriesFloatingCardShell>
          <div className="flex flex-1 items-center justify-center p-6">
            <div className="w-full max-w-sm rounded-md border border-gray-200 bg-white p-6 text-center text-sm text-gray-600">
              {c.error}
            </div>
          </div>
        </InquiriesFloatingCardShell>
      );
    }
    return <InquiriesGmailStatusLoading />;
  }

  if (c.gmailConfigured && !c.gmailConnected && !c.nestConfigured) {
    return (
      <InquiriesFloatingCardShell
        headerActions={
          <CustomerEnquiriesHeader
            c={c}
            trailingActions={<CustomerEnquiriesHeaderActions c={c} />}
          />
        }
      >
        <div className="flex flex-1 items-center justify-center p-6">
          <div className="w-full max-w-sm rounded-md border border-gray-200 bg-white p-8 text-center">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-md border border-gray-200 bg-white">
              <GmailLogo />
            </span>
            <p className="mt-4 text-base font-medium text-gray-900">Connect your store inbox</p>
            <p className="mx-auto mt-1 text-sm text-gray-500">
              Sync customer enquiries and draft replies in your shop voice.
            </p>
            {c.error ? <p className="mt-3 text-xs text-gray-500">{c.error}</p> : null}
            <Button
              type="button"
              className="mt-5 rounded-md"
              onClick={() => void c.handleConnectGmail()}
              disabled={c.connecting}
            >
              {c.connecting ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <Mail className="mr-1.5 h-4 w-4" />
              )}
              Connect Gmail
            </Button>
          </div>
        </div>
      </InquiriesFloatingCardShell>
    );
  }

  if (!c.gmailConfigured && !c.nestConfigured) {
    return (
      <InquiriesFloatingCardShell>
        <div className="flex flex-1 items-center justify-center p-6">
          <div className="w-full max-w-sm rounded-md border border-gray-200 bg-white p-6 text-center text-sm text-gray-600">
            Gmail integration is not configured for this environment.
          </div>
        </div>
      </InquiriesFloatingCardShell>
    );
  }

  return (
    <>
      <FloatingCardPageHeader>
        <CustomerEnquiriesHeader
          c={c}
          trailingActions={<CustomerEnquiriesHeaderActions c={c} />}
        />
      </FloatingCardPageHeader>

      <FloatingCardPageBody>
        <FloatingCard>
          <CustomerEnquiriesFilterBar c={c} onCloseAll={() => setCloseAllOpen(true)} />
          <EnquiriesSplitView c={c} />
        </FloatingCard>
      </FloatingCardPageBody>

      {c.sendConfirmOpen ? (
        <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center">
          <button
            type="button"
            aria-label="Close dialog"
            className="absolute inset-0 bg-black/40 animate-in fade-in duration-200"
            onClick={() => !c.sending && c.setSendConfirmOpen(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            className="relative z-10 w-full max-w-lg overflow-hidden rounded-md border border-gray-200 bg-white p-5 animate-in slide-in-from-bottom-4 zoom-in-95 duration-300 ease-out sm:mx-4"
          >
            <h3 className="text-base font-semibold text-gray-900">Send this reply?</h3>
            <p className="mt-2 text-sm text-gray-600">
              This sends your edited draft to {c.detail?.sender_email}. Nothing goes out until you
              confirm.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                className="rounded-md"
                onClick={() => c.setSendConfirmOpen(false)}
                disabled={c.sending}
              >
                Cancel
              </Button>
              <Button
                type="button"
                className="rounded-md"
                onClick={() => void c.handleSend()}
                disabled={c.sending || !c.draft.trim()}
              >
                {c.sending ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <Send className="mr-1.5 h-4 w-4" />
                )}
                Send now
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {c.banConfirmOpen ? (
        <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center">
          <button
            type="button"
            aria-label="Close dialog"
            className="absolute inset-0 bg-black/40 animate-in fade-in duration-200"
            onClick={() => !c.banning && c.setBanConfirmOpen(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            className="relative z-10 w-full max-w-lg overflow-hidden rounded-md border border-gray-200 bg-white p-5 animate-in slide-in-from-bottom-4 zoom-in-95 duration-300 ease-out sm:mx-4"
          >
            <h3 className="text-base font-semibold text-gray-900">Ban this sender?</h3>
            <p className="mt-2 text-sm text-gray-600">
              Future emails from {c.detail?.sender_email} will not be imported as customer enquiries.
              This enquiry will be ignored.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                className="rounded-md"
                onClick={() => c.setBanConfirmOpen(false)}
                disabled={c.banning}
              >
                Cancel
              </Button>
              <Button
                type="button"
                className="rounded-md"
                onClick={() => void c.handleBanSender()}
                disabled={c.banning}
              >
                {c.banning ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <UserX className="mr-1.5 h-4 w-4" />
                )}
                Ban sender
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <AlertDialog open={closeAllOpen} onOpenChange={setCloseAllOpen}>
        <AlertDialogContent className="rounded-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Close all cases needing action?</AlertDialogTitle>
            <AlertDialogDescription>
              This closes {c.needsActionCount} case{c.needsActionCount === 1 ? "" : "s"} without
              sending a reply. New customer messages will reopen a case automatically.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-md">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-md"
              disabled={c.closingCases}
              onClick={(event) => {
                event.preventDefault();
                void c.handleCloseAllNeedsAction().finally(() => setCloseAllOpen(false));
              }}
            >
              {c.closingCases ? "Closing…" : "Close all"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
