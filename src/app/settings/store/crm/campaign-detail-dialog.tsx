"use client";

import * as React from "react";
import { Eye, Loader2, Users } from "@/components/layout/app-sidebar/dashboard-icons";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { renderCampaignEmail, type StoreBranding } from "@/lib/crm/templates";
import type { CrmCampaign, CrmCampaignRecipient } from "@/lib/crm/types";

const PREVIEW_UNSUBSCRIBE_PLACEHOLDER = "https://example.com/unsubscribe";

type DetailTab = "email" | "recipients";

function formatTimestamp(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function recipientStatusLabel(status: string): string {
  switch (status) {
    case "sent":
      return "Sent";
    case "failed":
      return "Failed";
    case "pending":
      return "Pending";
    case "skipped_opted_out":
      return "Opted out";
    case "skipped_invalid":
      return "Invalid";
    default:
      return status.replace(/_/g, " ");
  }
}

function EngagementCell({ at }: { at: string | null }) {
  if (!at) {
    return <span className="text-muted-foreground">—</span>;
  }
  return (
    <span className="inline-flex items-center gap-1 text-emerald-700">
      <span className="size-1.5 rounded-full bg-emerald-500" />
      <span className="text-xs">{formatTimestamp(at)}</span>
    </span>
  );
}

export function CampaignDetailDialog(props: {
  campaign: CrmCampaign | null;
  store: StoreBranding;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialTab?: DetailTab;
}) {
  const { campaign, store, open, onOpenChange, initialTab = "email" } = props;
  const [tab, setTab] = React.useState<DetailTab>(initialTab);
  const [recipients, setRecipients] = React.useState<CrmCampaignRecipient[]>([]);
  const [loadingRecipients, setLoadingRecipients] = React.useState(false);
  const [recipientSearch, setRecipientSearch] = React.useState("");

  React.useEffect(() => {
    if (!open) {
      setRecipientSearch("");
      return;
    }
    setTab(initialTab);
  }, [open, initialTab]);

  React.useEffect(() => {
    if (!open || !campaign) return;
    let cancelled = false;
    setLoadingRecipients(true);
    void fetch(`/api/store/crm/campaigns/${campaign.id}`, { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error("Failed to load recipients");
        const data = await res.json();
        if (!cancelled) setRecipients(data.recipients ?? []);
      })
      .catch(() => {
        if (!cancelled) setRecipients([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingRecipients(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, campaign?.id]);

  const previewHtml = React.useMemo(() => {
    if (!campaign) return "";
    return renderCampaignEmail({
      templateKey: campaign.template_key,
      content: campaign.content,
      store,
      unsubscribeUrl: PREVIEW_UNSUBSCRIBE_PLACEHOLDER,
    }).html;
  }, [campaign, store]);

  const filteredRecipients = React.useMemo(() => {
    const query = recipientSearch.trim().toLowerCase();
    if (!query) return recipients;
    return recipients.filter((recipient) => recipient.email.toLowerCase().includes(query));
  }, [recipients, recipientSearch]);

  if (!campaign) return null;

  const sentOrAttempted =
    campaign.status === "sent" || campaign.status === "failed" || campaign.status === "sending";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(90vh,860px)] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
        <DialogHeader className="border-b border-border/60 px-5 py-4">
          <DialogTitle className="pr-8 text-base font-semibold leading-snug">
            {campaign.subject}
          </DialogTitle>
          <p className="text-xs text-muted-foreground">
            {sentOrAttempted
              ? `${campaign.sent_count.toLocaleString()} sent`
              : `${campaign.intended_count.toLocaleString()} intended`}
            {campaign.sent_at ? ` · ${formatTimestamp(campaign.sent_at)}` : ""}
          </p>
        </DialogHeader>

        <div className="border-b border-border/60 px-5 py-3">
          <div className="flex items-center bg-gray-100 p-0.5 rounded-md w-fit">
            <button
              type="button"
              onClick={() => setTab("email")}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
                tab === "email"
                  ? "text-gray-800 bg-white shadow-sm"
                  : "text-gray-600 hover:bg-gray-200/70",
              )}
            >
              <Eye size={15} />
              Email
            </button>
            <button
              type="button"
              onClick={() => setTab("recipients")}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
                tab === "recipients"
                  ? "text-gray-800 bg-white shadow-sm"
                  : "text-gray-600 hover:bg-gray-200/70",
              )}
            >
              <Users size={15} />
              Recipients
              {recipients.length > 0 ? (
                <span className="rounded-md bg-gray-200/80 px-1.5 py-0.5 text-[10px] font-semibold text-gray-600">
                  {recipients.length}
                </span>
              ) : null}
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {tab === "email" ? (
            <div className="p-5">
              <div className="overflow-hidden rounded-md border border-border/60 bg-white shadow-sm">
                <iframe
                  title="Sent campaign email"
                  sandbox=""
                  srcDoc={previewHtml}
                  className="h-[min(62vh,560px)] w-full bg-white"
                />
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-3 p-5">
              <Input
                value={recipientSearch}
                onChange={(event) => setRecipientSearch(event.target.value)}
                placeholder="Search by email…"
                className="h-9"
              />

              {loadingRecipients ? (
                <div className="space-y-2">
                  {Array.from({ length: 5 }).map((_, index) => (
                    <Skeleton key={index} className="h-10 w-full rounded-md" />
                  ))}
                </div>
              ) : filteredRecipients.length === 0 ? (
                <div className="rounded-md border border-border/50 bg-white px-4 py-10 text-center text-sm text-muted-foreground">
                  {recipients.length === 0 ? "No recipients recorded for this campaign." : "No matches."}
                </div>
              ) : (
                <div className="overflow-hidden rounded-md border border-border/60 bg-white">
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[640px] text-left text-sm">
                      <thead>
                        <tr className="border-b border-border/60 bg-gray-50 text-xs font-medium text-muted-foreground">
                          <th className="px-3 py-2.5 font-medium">Email</th>
                          <th className="px-3 py-2.5 font-medium">Status</th>
                          <th className="px-3 py-2.5 font-medium">Sent</th>
                          <th className="px-3 py-2.5 font-medium">Delivered</th>
                          <th className="px-3 py-2.5 font-medium">Opened</th>
                          <th className="px-3 py-2.5 font-medium">Clicked</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredRecipients.map((recipient) => (
                          <tr
                            key={recipient.email}
                            className="border-b border-border/40 last:border-b-0"
                          >
                            <td className="max-w-[200px] truncate px-3 py-2.5 font-medium text-foreground">
                              {recipient.email}
                            </td>
                            <td className="px-3 py-2.5">
                              <span
                                className={cn(
                                  "inline-flex rounded-md px-2 py-0.5 text-[11px] font-medium capitalize",
                                  recipient.status === "sent"
                                    ? "bg-emerald-50 text-emerald-700"
                                    : recipient.status === "failed"
                                      ? "bg-red-50 text-red-700"
                                      : "bg-gray-100 text-gray-600",
                                )}
                              >
                                {recipientStatusLabel(recipient.status)}
                              </span>
                            </td>
                            <td className="px-3 py-2.5 text-xs text-muted-foreground">
                              {formatTimestamp(recipient.sent_at)}
                            </td>
                            <td className="px-3 py-2.5">
                              <EngagementCell at={recipient.delivered_at} />
                            </td>
                            <td className="px-3 py-2.5">
                              <EngagementCell at={recipient.opened_at} />
                            </td>
                            <td className="px-3 py-2.5">
                              <EngagementCell at={recipient.clicked_at} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
