"use client";

import { Loader2, Mail, RefreshCw, Send, UserX, CheckCheck } from "lucide-react";
import { GmailLogo } from "@/components/genie/gmail-logo";
import { Button } from "@/components/ui/button";
import {
  CustomerEnquiriesPageHeader,
  storeSettingsHeaderActionClass,
  storeSettingsPageChromeClass,
  storeSettingsPageHeaderNudgeClass,
} from "@/components/settings/actions-page-header";
import { InboxFilterTabs } from "@/components/settings/customer-inquiries/inbox-filter-tabs";
import { InquirySlidePanel } from "@/components/settings/customer-inquiries/inquiry-slide-panel";
import { UnifiedInboxTable } from "@/components/settings/customer-inquiries/unified-inbox-table";
import { useUnifiedInboxController } from "@/components/settings/customer-inquiries/use-unified-inbox-controller";
import { cn } from "@/lib/utils";

function InquiriesGmailStatusLoading() {
  return (
    <div className="flex h-full min-h-0 items-center justify-center bg-white p-6">
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading enquiries…
      </div>
    </div>
  );
}

export function StoreCustomerInquiriesPanel() {
  const c = useUnifiedInboxController();

  if (!c.gmailStatusReady) {
    if (c.loading) {
      return <InquiriesGmailStatusLoading />;
    }
    if (c.error) {
      return (
        <div className="flex h-full min-h-0 items-center justify-center bg-white p-6">
          <div className="w-full max-w-sm rounded-md border border-gray-200 bg-white p-6 text-center text-sm text-gray-600">
            {c.error}
          </div>
        </div>
      );
    }
    return <InquiriesGmailStatusLoading />;
  }

  if (c.gmailConfigured && !c.gmailConnected && !c.nestConfigured) {
    return (
      <div className="flex h-full min-h-0 items-center justify-center bg-white p-6">
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
    );
  }

  if (!c.gmailConfigured && !c.nestConfigured) {
    return (
      <div className="flex h-full min-h-0 items-center justify-center bg-white p-6">
        <div className="w-full max-w-sm rounded-md border border-gray-200 bg-white p-6 text-center text-sm text-gray-600">
          Gmail integration is not configured for this environment.
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-white">
      <div className={cn("shrink-0 bg-white", storeSettingsPageChromeClass)}>
        <CustomerEnquiriesPageHeader
          className={storeSettingsPageHeaderNudgeClass}
          composeDisabled={!c.nestConfigured}
          onMessageStarted={c.handleNestStarted}
          trailingActions={
            <>
              {c.gmailConfigured && !c.gmailConnected ? (
                <button
                  type="button"
                  onClick={() => void c.handleConnectGmail()}
                  disabled={c.connecting}
                  className={storeSettingsHeaderActionClass(false, c.connecting)}
                >
                  {c.connecting ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Mail className="h-3.5 w-3.5" />
                  )}
                  Connect Gmail
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => void c.handleRefreshAll()}
                disabled={c.refreshing || c.listLoading}
                className={storeSettingsHeaderActionClass(false, c.refreshing || c.listLoading)}
              >
                {c.refreshing ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
                Refresh
              </button>
            </>
          }
        />

        <div
          className={cn(
            "flex shrink-0 items-center justify-between gap-3 border-b border-gray-200 pb-2",
            storeSettingsPageHeaderNudgeClass,
          )}
        >
          <InboxFilterTabs
            value={c.inboxTab}
            onChange={c.setInboxTab}
            counts={c.tabCounts}
          />
          {c.unreadCount > 0 ? (
            <button
              type="button"
              onClick={() => void c.handleMarkAllAsRead()}
              disabled={c.markingAllRead}
              className={storeSettingsHeaderActionClass(false, c.markingAllRead)}
            >
              {c.markingAllRead ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <CheckCheck className="h-3.5 w-3.5" />
              )}
              Mark all as read
            </button>
          ) : null}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <UnifiedInboxTable c={c} />
      </div>

      <InquirySlidePanel c={c} />

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
    </div>
  );
}
