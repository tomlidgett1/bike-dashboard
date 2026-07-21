"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  BarChart3,
  ChevronDown,
  Inbox,
  Instagram,
  Loader2,
  Mail,
  Search,
  Send,
  Settings,
  Star,
  UserX,
} from "@/components/layout/app-sidebar/dashboard-icons";
import { GmailLogo } from "@/components/genie/gmail-logo";
import { NestLogo } from "@/components/genie/nest-logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  CustomerEnquiriesPageHeader,
  NestNewMessageButton,
  storeSettingsHeaderActionClass,
} from "@/components/settings/actions-page-header";
import { EnquiriesNavTabs } from "@/components/settings/customer-inquiries/enquiries-nav-tabs";
import { InboxSourceSelect } from "@/components/settings/customer-inquiries/inbox-source-select";
import { EnquiryConversationList } from "@/components/settings/customer-inquiries/enquiry-conversation-list";
import { EnquiryConversationPane } from "@/components/settings/customer-inquiries/enquiry-conversation-pane";
import { NestNewMessagePanel } from "@/components/settings/customer-inquiries/nest-new-message-panel";
import {
  INBOX_STATUS_TABS,
  useUnifiedInboxController,
  type UnifiedInboxController,
} from "@/components/settings/customer-inquiries/use-unified-inbox-controller";
import { SHOW_GOOGLE_BUSINESS_CONNECT } from "@/components/settings/customer-inquiries/google-business-connect-card";
import {
  FloatingCard,
  FloatingCardPageBody,
  FloatingCardPageHeader,
  FloatingCardPageTitleRow,
} from "@/components/layout/floating-card-page";
import { floatingCardPageHeaderNudgeClass } from "@/lib/layout/floating-card-page";
import {
  findNestInboxRowKeyByPhone,
  parseCustomerEnquiriesNestPrefill,
  prefillToNestComposeRecipient,
  type NestComposeInitialRecipient,
} from "@/lib/customer-inquiries/enquiries-deep-link";
import { cn } from "@/lib/utils";

function EnquiriesPageSpinner({ label = "Loading enquiries" }: { label?: string }) {
  return (
    <div
      role="status"
      aria-label={label}
      className="h-5 w-5 animate-spin rounded-full border-2 border-gray-200 border-t-gray-500"
    />
  );
}

function EnquiriesPageLoadingState() {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center">
      <EnquiriesPageSpinner />
    </div>
  );
}

function InquiriesGmailStatusLoading({ embedded = false }: { embedded?: boolean }) {
  return (
    <InquiriesFloatingCardShell embedded={embedded}>
      <EnquiriesPageLoadingState />
    </InquiriesFloatingCardShell>
  );
}

function InquiriesFloatingCardShell({
  headerActions,
  embedded = false,
  children,
}: {
  headerActions?: ReactNode;
  embedded?: boolean;
  children: ReactNode;
}) {
  if (embedded) {
    return <div className="flex h-full min-h-0 flex-col overflow-hidden">{children}</div>;
  }

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

function CustomerEnquiriesHeader({ trailingActions }: { trailingActions?: ReactNode }) {
  return (
    <CustomerEnquiriesPageHeader
      className={cn(floatingCardPageHeaderNudgeClass, "!static !pb-0")}
      hideCompose
      trailingActions={trailingActions}
    />
  );
}

function CustomerEnquiriesFilterBar({
  c,
  onNewMessage,
  trailingActions,
  embedded = false,
}: {
  c: UnifiedInboxController;
  onNewMessage: () => void;
  trailingActions?: ReactNode;
  embedded?: boolean;
}) {
  const statusItems = INBOX_STATUS_TABS.map((tab) => ({
    ...tab,
    count: c.statusCounts[tab.id],
  }));

  return (
    <div
      className={cn(
        "flex shrink-0 flex-wrap items-center gap-2.5 border-b border-border/60 bg-gray-50 px-4 py-3 md:px-5",
        !embedded && "rounded-t-xl",
      )}
    >
      <NestNewMessageButton disabled={!c.nestConfigured} onOpen={onNewMessage} />
      <EnquiriesNavTabs items={statusItems} value={c.statusTab} onChange={c.setStatusTab} />
      <InboxSourceSelect value={c.sourceTab} onChange={c.setSourceTab} />
      {trailingActions ? (
        <div className="ml-auto flex flex-wrap items-center gap-2">{trailingActions}</div>
      ) : null}
    </div>
  );
}

function EnquiriesSplitView({
  c,
  composing,
  onCloseCompose,
  composePrefill,
}: {
  c: UnifiedInboxController;
  composing: boolean;
  onCloseCompose: () => void;
  composePrefill: NestComposeInitialRecipient | null;
}) {
  const hasSelection = Boolean(c.selectedKey && c.selectedRow);
  const showPane = composing || hasSelection;

  return (
    <div className="flex min-h-0 flex-1">
      <div
        className={cn(
          "flex min-h-0 w-full min-w-0 flex-col md:flex md:w-[340px] md:shrink-0 md:border-r md:border-border/60 lg:w-[380px]",
          showPane ? "hidden" : "flex",
        )}
      >
        <div className="shrink-0 border-b border-gray-100 px-3 py-2.5">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
            <Input
              type="search"
              value={c.searchQuery}
              onChange={(event) => c.setSearchQuery(event.target.value)}
              placeholder="Search name, email, subject…"
              className="h-8 rounded-full border-gray-200 bg-white pl-8 text-sm shadow-sm"
            />
          </div>
        </div>
        <EnquiryConversationList c={c} />
      </div>
      <div
        className={cn(
          "min-w-0 flex-1 flex-col md:flex",
          showPane ? "flex" : "hidden",
        )}
      >
        {composing ? (
          <NestNewMessagePanel
            onClose={onCloseCompose}
            onStarted={c.handleNestStarted}
            initialRecipient={composePrefill}
          />
        ) : (
          <EnquiryConversationPane c={c} />
        )}
      </div>
    </div>
  );
}

function CustomerEnquiriesHeaderActions({ c }: { c: UnifiedInboxController }) {
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <>
      {c.nestConfigured ? (
        <Link
          href="/settings/store/nest-knowledge"
          className={storeSettingsHeaderActionClass()}
        >
          <NestLogo className="size-[15px]" />
          Train nest
        </Link>
      ) : (
        <button
          type="button"
          disabled
          className={storeSettingsHeaderActionClass(false, true)}
          title="Connect Nest to train knowledge"
        >
          <NestLogo className="size-[15px]" />
          Train nest
        </button>
      )}
      <DropdownMenu open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className={cn(storeSettingsHeaderActionClass(), "px-2.5")}
            aria-label="Settings"
            title="Settings"
          >
            <Settings className="size-[15px]" />
            <ChevronDown
              className={cn(
                "h-3.5 w-3.5 text-gray-400 transition-transform duration-200",
                settingsOpen && "rotate-180",
              )}
            />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-44 rounded-2xl bg-white p-1.5">
          <DropdownMenuItem asChild className="gap-2 rounded-md">
            <Link href="/settings/store/customer-inquiries/analytics">
              <BarChart3 className="size-[15px]" />
              Analytics
            </Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
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
      {c.instagramStatusReady && c.instagramConfigured && !c.instagramConnected ? (
        <button
          type="button"
          onClick={() => void c.handleConnectInstagram()}
          disabled={c.instagramConnecting}
          className={storeSettingsHeaderActionClass(false, c.instagramConnecting)}
        >
          {c.instagramConnecting ? (
            <Loader2 className="size-[15px] animate-spin" />
          ) : (
            <Instagram className="size-[15px]" />
          )}
          Connect Instagram
        </button>
      ) : null}
      {SHOW_GOOGLE_BUSINESS_CONNECT &&
      c.googleReviewsStatusReady &&
      !c.googleReviewsConnected ? (
        <button
          type="button"
          onClick={() => {
            window.location.href = "/api/store/google-business/auth/initiate";
          }}
          className={storeSettingsHeaderActionClass(false, false)}
        >
          <Star className="size-[15px]" />
          Connect Google Business
        </button>
      ) : null}
    </>
  );
}

export function StoreCustomerInquiriesPanel({
  embedded: embeddedProp = false,
}: {
  /** When true (CRM Inbox), hide the standalone "Customer enquiries" page chrome. */
  embedded?: boolean;
}) {
  const c = useUnifiedInboxController();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const embedded =
    embeddedProp || (pathname?.includes("/settings/store/crm/inbox") ?? false);
  const [composing, setComposing] = useState(false);
  const [composePrefill, setComposePrefill] = useState<NestComposeInitialRecipient | null>(
    null,
  );
  const handledDeepLinkRef = useRef<string | null>(null);

  useEffect(() => {
    if (c.selectedKey) setComposing(false);
  }, [c.selectedKey]);

  useEffect(() => {
    const prefill = parseCustomerEnquiriesNestPrefill(searchParams);
    if (!prefill) return;

    const deepLinkKey = searchParams.toString();
    if (handledDeepLinkRef.current === deepLinkKey) return;
    if (c.listLoading && c.allRows.length === 0) return;

    handledDeepLinkRef.current = deepLinkKey;
    router.replace(pathname, { scroll: false });

    if (prefill.chatId) {
      const row = c.allRows.find((item) => item.nestChatId === prefill.chatId);
      if (row) {
        c.setSourceTab("nest");
        c.openRow(row);
        return;
      }
    }

    if (prefill.phone) {
      const matchedKey = findNestInboxRowKeyByPhone(c.allRows, prefill.phone);
      if (matchedKey) {
        const row = c.allRows.find((item) => item.key === matchedKey);
        if (row) {
          c.setSourceTab("nest");
          c.openRow(row);
          return;
        }
      }
    }

    if (prefill.compose) {
      const recipient = prefillToNestComposeRecipient(prefill);
      if (recipient) {
        c.closePanel();
        setComposePrefill(recipient);
        setComposing(true);
        c.setSourceTab("nest");
      }
    }
  }, [
    c.allRows,
    c.closePanel,
    c.listLoading,
    c.openRow,
    c.setSourceTab,
    pathname,
    router,
    searchParams,
  ]);

  const openCompose = () => {
    c.closePanel();
    setComposePrefill(null);
    setComposing(true);
  };

  const closeCompose = () => {
    setComposePrefill(null);
    setComposing(false);
  };

  const headerActions = <CustomerEnquiriesHeaderActions c={c} />;

  if (!c.gmailStatusReady) {
    if (c.loading) {
      return <InquiriesGmailStatusLoading embedded={embedded} />;
    }
    if (c.error) {
      return (
        <InquiriesFloatingCardShell embedded={embedded}>
          <div className="flex flex-1 items-center justify-center p-6">
            <div className="w-full max-w-sm rounded-md border border-gray-200 bg-white p-6 text-center text-sm text-gray-600">
              {c.error}
            </div>
          </div>
        </InquiriesFloatingCardShell>
      );
    }
    return <InquiriesGmailStatusLoading embedded={embedded} />;
  }

  if (c.gmailConfigured && !c.gmailConnected && !c.nestConfigured) {
    return (
      <InquiriesFloatingCardShell
        embedded={embedded}
        headerActions={
          embedded ? undefined : <CustomerEnquiriesHeader trailingActions={headerActions} />
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
      <InquiriesFloatingCardShell embedded={embedded}>
        <div className="flex min-h-0 flex-1 items-center justify-center p-6">
          <div className="w-full max-w-sm rounded-md border border-gray-200 bg-white p-6 text-center text-sm text-gray-600">
            Gmail integration is not configured for this environment.
          </div>
        </div>
      </InquiriesFloatingCardShell>
    );
  }

  if (c.listLoading && c.allRows.length === 0) {
    return (
      <>
        {embedded ? null : (
          <FloatingCardPageHeader>
            <CustomerEnquiriesHeader trailingActions={headerActions} />
          </FloatingCardPageHeader>
        )}

        {embedded ? (
          <div className="flex h-full min-h-0 flex-col overflow-hidden">
            <EnquiriesPageLoadingState />
          </div>
        ) : (
          <FloatingCardPageBody>
            <FloatingCard>
              <EnquiriesPageLoadingState />
            </FloatingCard>
          </FloatingCardPageBody>
        )}
      </>
    );
  }

  return (
    <>
      {embedded ? null : (
        <FloatingCardPageHeader>
          <CustomerEnquiriesHeader trailingActions={headerActions} />
        </FloatingCardPageHeader>
      )}

      {embedded ? (
        <div className="flex h-full min-h-0 flex-col overflow-hidden bg-white">
          <CustomerEnquiriesFilterBar
            c={c}
            onNewMessage={openCompose}
            trailingActions={headerActions}
            embedded
          />
          <EnquiriesSplitView
            c={c}
            composing={composing}
            onCloseCompose={closeCompose}
            composePrefill={composePrefill}
          />
        </div>
      ) : (
        <FloatingCardPageBody>
          <FloatingCard>
            <CustomerEnquiriesFilterBar c={c} onNewMessage={openCompose} />
            <EnquiriesSplitView
              c={c}
              composing={composing}
              onCloseCompose={closeCompose}
              composePrefill={composePrefill}
            />
          </FloatingCard>
        </FloatingCardPageBody>
      )}
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
    </>
  );
}
