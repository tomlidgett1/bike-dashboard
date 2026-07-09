"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles,
  Zap,
  BookOpen,
  ReceiptText,
  Settings2,
  ChevronDown,
  RefreshCw,
  Check,
  X,
  Mail,
  MessageSquare,
  Tags,
  Eye,
} from "@/components/layout/app-sidebar/dashboard-icons";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DashboardFloatingPage } from "@/components/layout/dashboard-floating-page";
import { SettingsNavTabs } from "@/components/settings/settings-nav-tabs";
import { SettingsManagerLoading } from "@/components/settings/settings-manager-loading";
import { cn } from "@/lib/utils";
import { DOMESTIQUE_PLAYBOOKS } from "@/lib/domestique/playbooks";
import type {
  DomestiqueConfig,
  DomestiqueConfigUpdate,
  DomestiqueMode,
  DomestiqueOpportunity,
  DomestiquePlaybookKey,
  DomestiqueReceipt,
} from "@/lib/types/domestique";

type DomestiqueTab = "today" | "playbooks" | "receipts" | "settings";

const TABS: { id: DomestiqueTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "today", label: "Today", icon: Zap },
  { id: "playbooks", label: "Playbooks", icon: BookOpen },
  { id: "receipts", label: "Receipts", icon: ReceiptText },
  { id: "settings", label: "Settings", icon: Settings2 },
];

const PLAYBOOK_NAMES = new Map(DOMESTIQUE_PLAYBOOKS.map((p) => [p.key, p.name]));

const MODE_OPTIONS: { id: DomestiqueMode; label: string; description: string }[] = [
  { id: "suggest", label: "Suggest", description: "Drafts everything, sends nothing. Good for the first fortnight." },
  { id: "copilot", label: "Co-pilot", description: "Proposes plays each morning; you approve with one tap." },
  { id: "autopilot", label: "Autopilot", description: "Executes chosen playbooks automatically within guardrails." },
];

const STATUS_LABELS: Record<string, string> = {
  proposed: "Awaiting approval",
  approved: "Approved",
  executing: "Executing",
  executed: "Executed",
  skipped: "Skipped",
  failed: "Failed",
  expired: "Expired",
};

function formatAud(value: number | string | null | undefined): string {
  const n = typeof value === "string" ? parseFloat(value) : value;
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toLocaleString("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short" });
}

// ------------------------------------------------------------------
// Opportunity card
// ------------------------------------------------------------------

type EditPayload = {
  email?: { subject?: string; title?: string; body?: string; ctaText?: string; ctaUrl?: string };
  sms?: { body: string };
  discount_days?: number;
  remove_discount_product_ids?: string[];
};

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{children}</p>;
}

function CustomersSection({ contacts }: { contacts: NonNullable<DomestiqueOpportunity["action_plan"]["contacts"]> }) {
  const [showAll, setShowAll] = React.useState(false);
  const visible = showAll ? contacts : contacts.slice(0, 8);
  const holdouts = contacts.filter((c) => c.is_holdout).length;

  return (
    <div>
      <SectionLabel>
        Customers in this play ({contacts.length - holdouts} contacted{holdouts > 0 ? `, ${holdouts} held out` : ""})
      </SectionLabel>
      <div className="mt-1.5 overflow-hidden rounded-md border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-medium text-gray-500">
              <th className="px-3 py-2">Customer</th>
              <th className="hidden px-3 py-2 sm:table-cell">Reach them via</th>
              <th className="px-3 py-2">Why they're included</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((contact) => (
              <tr key={contact.contact_id} className="border-b border-gray-50 last:border-0">
                <td className="px-3 py-2 text-gray-800">
                  <span className="flex items-center gap-1.5">
                    {contact.first_name || "Customer"}
                    {contact.is_holdout ? (
                      <span className="rounded-md bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500">
                        Holdout — not contacted
                      </span>
                    ) : null}
                  </span>
                </td>
                <td className="hidden px-3 py-2 text-xs text-gray-500 sm:table-cell">
                  {[contact.email ? "Email" : null, contact.phone ? "Text" : null].filter(Boolean).join(" + ") || "—"}
                </td>
                <td className="px-3 py-2 text-xs text-gray-600">{contact.context ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {contacts.length > 8 ? (
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            className="w-full border-t border-gray-100 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
          >
            {showAll ? "Show fewer" : `Show all ${contacts.length}`}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function EmailSection({
  opportunity,
  editable,
  saving,
  onEdit,
}: {
  opportunity: DomestiqueOpportunity;
  editable: boolean;
  saving: boolean;
  onEdit: (id: string, payload: EditPayload) => Promise<boolean>;
}) {
  const email = opportunity.action_plan.email!;
  const [subject, setSubject] = React.useState(email.subject);
  const [title, setTitle] = React.useState(email.title);
  const [body, setBody] = React.useState(email.body);
  const [ctaText, setCtaText] = React.useState(email.ctaText ?? "");
  const [preview, setPreview] = React.useState<{ subject: string; html: string } | null>(null);
  const [previewLoading, setPreviewLoading] = React.useState(false);
  const [previewError, setPreviewError] = React.useState<string | null>(null);

  React.useEffect(() => {
    setSubject(email.subject);
    setTitle(email.title);
    setBody(email.body);
    setCtaText(email.ctaText ?? "");
  }, [email.subject, email.title, email.body, email.ctaText]);

  const dirty =
    subject !== email.subject || title !== email.title || body !== email.body || ctaText !== (email.ctaText ?? "");

  const saveEdits = React.useCallback(async () => {
    return onEdit(opportunity.id, { email: { subject, title, body, ctaText } });
  }, [onEdit, opportunity.id, subject, title, body, ctaText]);

  const loadPreview = React.useCallback(async () => {
    setPreviewLoading(true);
    setPreviewError(null);
    try {
      if (dirty) {
        const saved = await saveEdits();
        if (!saved) throw new Error("Could not save your edits before previewing");
      }
      const res = await fetch(`/api/store/domestique/opportunities/${opportunity.id}/preview`, {
        cache: "no-store",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Failed to render preview");
      setPreview({ subject: data.subject, html: data.html });
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : "Failed to render preview");
    } finally {
      setPreviewLoading(false);
    }
  }, [dirty, saveEdits, opportunity.id]);

  return (
    <div>
      <SectionLabel>The email — exactly what recipients get</SectionLabel>
      <div className="mt-1.5 rounded-md border border-gray-200 bg-white p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs font-medium text-gray-600">
            <Mail className="size-3.5" />
            Sent through your CRM email engine with open and click tracking
          </div>
          <div className="flex items-center gap-2">
            {editable && dirty ? (
              <Button size="sm" variant="outline" className="rounded-md" disabled={saving} onClick={() => void saveEdits()}>
                Save changes
              </Button>
            ) : null}
            <Button
              size="sm"
              variant="outline"
              className="rounded-md"
              disabled={previewLoading}
              onClick={() => (preview ? setPreview(null) : void loadPreview())}
            >
              <Eye className="size-4" />
              {previewLoading ? "Rendering…" : preview ? "Hide preview" : "Preview email"}
            </Button>
          </div>
        </div>

        <div className="mt-3 space-y-2.5">
          <div>
            <label className="text-xs font-medium text-gray-500">Subject line</label>
            {editable ? (
              <Input value={subject} disabled={saving} onChange={(e) => setSubject(e.target.value)} className="mt-1 rounded-md" />
            ) : (
              <p className="mt-1 text-sm text-gray-800">{email.subject}</p>
            )}
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500">Email heading</label>
            {editable ? (
              <Input value={title} disabled={saving} onChange={(e) => setTitle(e.target.value)} className="mt-1 rounded-md" />
            ) : (
              <p className="mt-1 text-sm text-gray-800">{email.title}</p>
            )}
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500">Body copy</label>
            {editable ? (
              <Textarea value={body} disabled={saving} onChange={(e) => setBody(e.target.value)} rows={6} className="mt-1 rounded-md" />
            ) : (
              <p className="mt-1 whitespace-pre-line text-sm text-gray-700">{email.body}</p>
            )}
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500">Button text{email.ctaUrl ? ` (links to ${email.ctaUrl})` : ""}</label>
            {editable ? (
              <Input value={ctaText} disabled={saving} onChange={(e) => setCtaText(e.target.value)} className="mt-1 max-w-xs rounded-md" />
            ) : (
              <p className="mt-1 text-sm text-gray-800">{email.ctaText ?? "—"}</p>
            )}
          </div>
          <p className="text-xs text-gray-400">
            {"{firstName}"} personalisation, your store logo, colours and the unsubscribe link are applied by the “
            {email.templateKey.replaceAll("_", " ")}” template — hit Preview to see the finished email.
          </p>
        </div>

        {previewError ? <p className="mt-2 text-xs text-red-600">{previewError}</p> : null}

        <AnimatePresence>
          {preview && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.4, ease: [0.04, 0.62, 0.23, 0.98] }}
              className="overflow-hidden"
            >
              <div className="mt-3 overflow-hidden rounded-md border border-gray-200">
                <div className="border-b border-gray-100 bg-gray-50 px-3 py-2 text-xs text-gray-600">
                  Subject: <span className="font-medium text-gray-800">{preview.subject}</span>
                </div>
                <iframe
                  title="Email preview"
                  srcDoc={preview.html}
                  sandbox=""
                  className="h-[560px] w-full bg-white"
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function SmsSection({
  opportunity,
  editable,
  saving,
  onEdit,
}: {
  opportunity: DomestiqueOpportunity;
  editable: boolean;
  saving: boolean;
  onEdit: (id: string, payload: EditPayload) => Promise<boolean>;
}) {
  const sms = opportunity.action_plan.sms!;
  const [body, setBody] = React.useState(sms.body);
  React.useEffect(() => setBody(sms.body), [sms.body]);
  const dirty = body !== sms.body;

  return (
    <div>
      <SectionLabel>The text message — sent via Nest</SectionLabel>
      <div className="mt-1.5 rounded-md border border-gray-200 bg-white p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs font-medium text-gray-600">
            <MessageSquare className="size-3.5" />
            Your Nest intro and sign-off wrap this automatically
          </div>
          {editable && dirty ? (
            <Button
              size="sm"
              variant="outline"
              className="rounded-md"
              disabled={saving || !body.trim()}
              onClick={() => void onEdit(opportunity.id, { sms: { body } })}
            >
              Save changes
            </Button>
          ) : null}
        </div>
        {editable ? (
          <Textarea value={body} disabled={saving} onChange={(e) => setBody(e.target.value.slice(0, 320))} rows={3} className="mt-2 rounded-md" />
        ) : null}
        <div className="mt-2 rounded-md bg-gray-50 px-3 py-2">
          <p className="text-xs text-gray-400">Recipients will see:</p>
          <p className="mt-0.5 text-sm text-gray-700">
            Hi {"{name}"}, {body} — {"{store}"}
          </p>
        </div>
      </div>
    </div>
  );
}

function DiscountsSection({
  opportunity,
  editable,
  saving,
  onEdit,
}: {
  opportunity: DomestiqueOpportunity;
  editable: boolean;
  saving: boolean;
  onEdit: (id: string, payload: EditPayload) => Promise<boolean>;
}) {
  const plan = opportunity.action_plan;
  const discounts = plan.discounts ?? [];
  const days = plan.discount_days ?? 7;
  const [daysDraft, setDaysDraft] = React.useState(String(days));
  React.useEffect(() => setDaysDraft(String(days)), [days]);

  const endsAt =
    opportunity.executed_at != null
      ? new Date(new Date(opportunity.executed_at).getTime() + days * 24 * 60 * 60 * 1000)
      : null;

  const commitDays = () => {
    const parsed = parseInt(daysDraft, 10);
    if (!Number.isFinite(parsed) || parsed < 1 || parsed > 30) {
      setDaysDraft(String(days));
      return;
    }
    if (parsed !== days) void onEdit(opportunity.id, { discount_days: parsed });
  };

  return (
    <div>
      <SectionLabel>Storefront discounts ({discounts.length} products)</SectionLabel>
      <div className="mt-1.5 rounded-md border border-gray-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-3 py-2.5">
          <div className="flex items-center gap-1.5 text-xs text-gray-600">
            <Tags className="size-3.5" />
            {opportunity.status === "executed" && endsAt ? (
              <span>
                Live now — discounts expire {endsAt.toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" })} and full price returns automatically
              </span>
            ) : (
              <span>Goes live on approval, expires automatically after the timer — full price returns, nothing is deleted</span>
            )}
          </div>
          <div className="flex items-center gap-1.5 text-xs text-gray-600">
            Runs for
            {editable ? (
              <Input
                type="number"
                min={1}
                max={30}
                value={daysDraft}
                disabled={saving}
                onChange={(e) => setDaysDraft(e.target.value)}
                onBlur={commitDays}
                onKeyDown={(e) => e.key === "Enter" && commitDays()}
                className="h-7 w-16 rounded-md text-xs"
              />
            ) : (
              <span className="font-medium text-gray-800">{days}</span>
            )}
            days
          </div>
        </div>

        <div className="divide-y divide-gray-50">
          {discounts.map((item) => (
            <div key={item.product_id} className="flex items-center gap-3 px-3 py-2.5">
              {item.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={item.image_url}
                  alt={item.name}
                  className="size-12 shrink-0 rounded-md border border-gray-100 bg-white object-contain"
                />
              ) : (
                <div className="flex size-12 shrink-0 items-center justify-center rounded-md bg-gray-100 text-[9px] text-gray-400">
                  No image
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-gray-800">{item.name}</p>
                <p className="mt-0.5 text-xs text-gray-500">
                  {[
                    item.category_name,
                    item.days_since_sold != null ? `last sold ${item.days_since_sold} days ago` : "never sold",
                    `${Math.round(item.soh)} in stock`,
                    item.margin_at_sale != null ? `${item.margin_at_sale}% margin at sale price` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                {item.in_specials_cycle ? (
                  <span className="mt-1 inline-block rounded-md bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                    Also queued in your Specials carousel
                  </span>
                ) : null}
              </div>
              <div className="shrink-0 text-right">
                <p className="text-xs text-gray-400 line-through">{formatAud(item.retail)}</p>
                <p className="text-sm font-semibold text-gray-900">{formatAud(item.sale_price)}</p>
                <p className="text-xs text-gray-500">{item.discount_percent}% off</p>
              </div>
              {editable && discounts.length > 1 ? (
                <button
                  type="button"
                  title="Remove from this play"
                  disabled={saving}
                  onClick={() => void onEdit(opportunity.id, { remove_discount_product_ids: [item.product_id] })}
                  className="shrink-0 rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-40"
                >
                  <X className="size-4" />
                </button>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function OpportunityCard({
  opportunity,
  busy,
  onAction,
  onEdit,
}: {
  opportunity: DomestiqueOpportunity;
  busy: boolean;
  onAction: (id: string, action: "approve" | "skip") => void;
  onEdit: (id: string, payload: EditPayload) => Promise<boolean>;
}) {
  const [detailsOpen, setDetailsOpen] = React.useState(false);
  const isProposed = opportunity.status === "proposed";
  const plan = opportunity.action_plan;
  const evidence = opportunity.evidence?.points ?? [];
  const playbook = DOMESTIQUE_PLAYBOOKS.find((p) => p.key === opportunity.playbook_key);
  const contacts = plan.contacts ?? [];

  return (
    <div className="rounded-md border border-gray-200 bg-white">
      <div className="flex flex-wrap items-start justify-between gap-3 p-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-md bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
              {PLAYBOOK_NAMES.get(opportunity.playbook_key) ?? opportunity.playbook_key}
            </span>
            <span className="text-xs text-gray-500">{STATUS_LABELS[opportunity.status] ?? opportunity.status}</span>
            <span className="text-xs text-gray-400">{formatDate(opportunity.created_at)}</span>
          </div>
          <h3 className="mt-1.5 text-sm font-semibold text-gray-900">{opportunity.title}</h3>
          <p className="mt-1 text-sm text-gray-600">{opportunity.summary}</p>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
            <span>
              Est. value <span className="font-medium text-gray-800">{formatAud(opportunity.expected_value)}</span>
            </span>
            {opportunity.customer_count > 0 ? <span>{opportunity.customer_count} customers</span> : null}
            {opportunity.product_count > 0 ? <span>{opportunity.product_count} products</span> : null}
            <span>Confidence {Math.round(Number(opportunity.confidence) * 100)}%</span>
          </div>
        </div>

        {isProposed ? (
          <div className="flex shrink-0 items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              className="rounded-md"
              disabled={busy}
              onClick={() => onAction(opportunity.id, "skip")}
            >
              <X className="size-4" />
              Skip
            </Button>
            <Button
              size="sm"
              className="rounded-md"
              disabled={busy}
              onClick={() => onAction(opportunity.id, "approve")}
            >
              <Check className="size-4" />
              Approve &amp; run
            </Button>
          </div>
        ) : null}
      </div>

      <button
        type="button"
        onClick={() => setDetailsOpen((open) => !open)}
        className="flex w-full items-center gap-1.5 border-t border-gray-100 px-4 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50"
      >
        <ChevronDown
          className={cn("h-4 w-4 text-gray-400 transition-transform duration-200", detailsOpen && "rotate-180")}
        />
        {isProposed ? "Review, edit & evidence" : "Evidence & plan"}
      </button>

      <AnimatePresence>
        {detailsOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.4, ease: [0.04, 0.62, 0.23, 0.98] }}
            className="overflow-hidden"
          >
            <div className="space-y-4 border-t border-gray-100 bg-gray-50/60 px-4 py-4">
              {evidence.length > 0 ? (
                <div>
                  <SectionLabel>Why this play, right now</SectionLabel>
                  <ul className="mt-1.5 space-y-1 text-sm text-gray-700">
                    {evidence.map((point, index) => (
                      <li key={index} className="flex gap-2">
                        <span className="text-gray-400">•</span>
                        {point}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {playbook ? (
                <div>
                  <SectionLabel>How {playbook.name} works</SectionLabel>
                  <ul className="mt-1.5 space-y-1 text-sm text-gray-600">
                    {playbook.mechanics.map((step, index) => (
                      <li key={index} className="flex gap-2">
                        <span className="font-medium text-gray-400">{index + 1}.</span>
                        {step}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {contacts.length > 0 ? <CustomersSection contacts={contacts} /> : null}

              {plan.email ? (
                <EmailSection opportunity={opportunity} editable={isProposed} saving={busy} onEdit={onEdit} />
              ) : null}

              {plan.sms ? (
                <SmsSection opportunity={opportunity} editable={isProposed} saving={busy} onEdit={onEdit} />
              ) : null}

              {plan.discounts && plan.discounts.length > 0 ? (
                <DiscountsSection opportunity={opportunity} editable={isProposed} saving={busy} onEdit={onEdit} />
              ) : null}

              {opportunity.result ? (
                <div className="text-xs text-gray-500">
                  {[
                    opportunity.result.emails_sent != null ? `${opportunity.result.emails_sent} emails sent` : null,
                    opportunity.result.sms_sent != null ? `${opportunity.result.sms_sent} texts sent` : null,
                    opportunity.result.products_discounted != null
                      ? `${opportunity.result.products_discounted} products discounted`
                      : null,
                    opportunity.result.holdouts ? `${opportunity.result.holdouts} held out for attribution` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
              ) : null}

              {opportunity.status_detail ? (
                <p className="text-xs text-gray-500">{opportunity.status_detail}</p>
              ) : null}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ------------------------------------------------------------------
// Tabs
// ------------------------------------------------------------------

function TodayTab({
  opportunities,
  busyId,
  onAction,
  onEdit,
}: {
  opportunities: DomestiqueOpportunity[];
  busyId: string | null;
  onAction: (id: string, action: "approve" | "skip") => void;
  onEdit: (id: string, payload: EditPayload) => Promise<boolean>;
}) {
  const proposed = opportunities.filter((o) => o.status === "proposed");
  const rest = opportunities.filter((o) => o.status !== "proposed").slice(0, 20);

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-medium text-gray-900">Plays awaiting your approval</h2>
          <p className="mt-0.5 text-xs text-gray-500">
            Approvals expire at the end of the day — the Domestique proposes fresh plays each morning.
          </p>
        </div>
        {proposed.length === 0 ? (
          <div className="rounded-xl border border-gray-200 bg-white px-4 py-6 text-center text-sm text-gray-500">
            Nothing waiting. The next nightly run will surface new opportunities from your Lightspeed data.
          </div>
        ) : (
          proposed.map((opportunity) => (
            <OpportunityCard
              key={opportunity.id}
              opportunity={opportunity}
              busy={busyId === opportunity.id}
              onAction={onAction}
              onEdit={onEdit}
            />
          ))
        )}
      </section>

      {rest.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-sm font-medium text-gray-900">Recent activity</h2>
          {rest.map((opportunity) => (
            <OpportunityCard
              key={opportunity.id}
              opportunity={opportunity}
              busy={busyId === opportunity.id}
              onAction={onAction}
              onEdit={onEdit}
            />
          ))}
        </section>
      ) : null}
    </div>
  );
}

function PlaybookCard({
  playbook,
  enabled,
  autopilot,
  autopilotAvailable,
  saving,
  onToggle,
}: {
  playbook: (typeof DOMESTIQUE_PLAYBOOKS)[number];
  enabled: boolean;
  autopilot: boolean;
  autopilotAvailable: boolean;
  saving: boolean;
  onToggle: (key: DomestiquePlaybookKey, list: "enabled_playbooks" | "autopilot_playbooks") => void;
}) {
  const [open, setOpen] = React.useState(false);

  return (
    <div className="rounded-md border border-gray-200 bg-white">
      <div className="flex flex-wrap items-start justify-between gap-3 p-4">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-gray-900">{playbook.name}</h3>
          <p className="mt-1 text-sm text-gray-600">{playbook.description}</p>
          <p className="mt-1.5 text-xs text-gray-400">
            Channel: {playbook.channel === "email_sms" ? "email + text" : playbook.channel} · proposes at most every{" "}
            {playbook.cooldown_days} days
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <label className="flex items-center gap-2 text-xs text-gray-600">
            Enabled
            <Switch
              checked={enabled}
              disabled={saving}
              onCheckedChange={() => onToggle(playbook.key, "enabled_playbooks")}
            />
          </label>
          <label className="flex items-center gap-2 text-xs text-gray-600">
            Autopilot
            <Switch
              checked={autopilot}
              disabled={saving || !enabled || !autopilotAvailable}
              onCheckedChange={() => onToggle(playbook.key, "autopilot_playbooks")}
            />
          </label>
        </div>
      </div>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1.5 border-t border-gray-100 px-4 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50"
      >
        <ChevronDown className={cn("h-4 w-4 text-gray-400 transition-transform duration-200", open && "rotate-180")} />
        How it works
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.4, ease: [0.04, 0.62, 0.23, 0.98] }}
            className="overflow-hidden"
          >
            <ul className="space-y-1.5 border-t border-gray-100 bg-gray-50/60 px-4 py-3 text-sm text-gray-600">
              {playbook.mechanics.map((step, index) => (
                <li key={index} className="flex gap-2">
                  <span className="font-medium text-gray-400">{index + 1}.</span>
                  {step}
                </li>
              ))}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function PlaybooksTab({
  config,
  saving,
  onSave,
}: {
  config: DomestiqueConfig;
  saving: boolean;
  onSave: (update: DomestiqueConfigUpdate) => void;
}) {
  const enabled = new Set(config.enabled_playbooks);
  const autopilot = new Set(config.autopilot_playbooks);

  const toggle = (key: DomestiquePlaybookKey, list: "enabled_playbooks" | "autopilot_playbooks") => {
    const current = list === "enabled_playbooks" ? enabled : autopilot;
    const next = new Set(current);
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
    }
    onSave({ [list]: Array.from(next) } as DomestiqueConfigUpdate);
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-500">
        Playbooks are the bike-retail triggers the Domestique watches for each night. Autopilot lets a playbook
        execute without approval — graduate them one at a time as the receipts earn it.
      </p>
      {DOMESTIQUE_PLAYBOOKS.map((playbook) => (
        <PlaybookCard
          key={playbook.key}
          playbook={playbook}
          enabled={enabled.has(playbook.key)}
          autopilot={autopilot.has(playbook.key)}
          autopilotAvailable={config.mode === "autopilot"}
          saving={saving}
          onToggle={toggle}
        />
      ))}
      {config.mode !== "autopilot" ? (
        <p className="text-xs text-gray-400">
          Autopilot toggles apply once the agent mode is set to Autopilot in Settings.
        </p>
      ) : null}
    </div>
  );
}

type ReceiptsSummary = {
  total_attributed_revenue: number;
  total_touches: number;
  total_holdouts: number;
  plays_executed: number;
};

function ReceiptsTab({
  receipts,
  summary,
}: {
  receipts: DomestiqueReceipt[];
  summary: ReceiptsSummary | null;
}) {
  return (
    <div className="space-y-6">
      {summary ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            { label: "Attributed revenue", value: formatAud(summary.total_attributed_revenue) },
            { label: "Plays executed", value: String(summary.plays_executed) },
            { label: "Customers touched", value: String(summary.total_touches) },
            { label: "Holdouts (control)", value: String(summary.total_holdouts) },
          ].map((stat) => (
            <div key={stat.label} className="rounded-xl border border-gray-200 bg-white p-4">
              <p className="text-lg font-semibold text-gray-900">{stat.value}</p>
              <p className="mt-0.5 text-xs text-gray-500">{stat.label}</p>
            </div>
          ))}
        </div>
      ) : null}

      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-medium text-gray-900">Weekly receipts</h2>
          <p className="mt-0.5 text-xs text-gray-500">
            Revenue from customers the Domestique touched, minus the holdout baseline — honest incremental lift,
            not post-hoc counting.
          </p>
        </div>
        {receipts.length === 0 ? (
          <div className="rounded-xl border border-gray-200 bg-white px-4 py-6 text-center text-sm text-gray-500">
            The first receipt lands after the agent's first full week of plays.
          </div>
        ) : (
          <div className="overflow-hidden rounded-md border border-gray-200 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-medium text-gray-500">
                  <th className="px-4 py-2.5">Week</th>
                  <th className="px-4 py-2.5">Plays</th>
                  <th className="px-4 py-2.5">Touches</th>
                  <th className="px-4 py-2.5 text-right">Attributed</th>
                  <th className="px-4 py-2.5 text-right">Baseline</th>
                  <th className="px-4 py-2.5 text-right">Incremental</th>
                </tr>
              </thead>
              <tbody>
                {receipts.map((receipt) => (
                  <tr key={receipt.id} className="border-b border-gray-50 last:border-0">
                    <td className="px-4 py-2.5 text-gray-700">
                      {formatDate(receipt.week_start)} – {formatDate(receipt.week_end)}
                    </td>
                    <td className="px-4 py-2.5 text-gray-600">{receipt.plays_executed}</td>
                    <td className="px-4 py-2.5 text-gray-600">{receipt.touches_count}</td>
                    <td className="px-4 py-2.5 text-right text-gray-700">{formatAud(receipt.attributed_revenue)}</td>
                    <td className="px-4 py-2.5 text-right text-gray-500">−{formatAud(receipt.holdout_baseline)}</td>
                    <td className="px-4 py-2.5 text-right font-medium text-gray-900">
                      {formatAud(receipt.incremental_revenue)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function NumberField({
  label,
  hint,
  value,
  min,
  max,
  suffix,
  disabled,
  onCommit,
}: {
  label: string;
  hint?: string;
  value: number;
  min: number;
  max: number;
  suffix?: string;
  disabled?: boolean;
  onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = React.useState(String(value));
  React.useEffect(() => setDraft(String(value)), [value]);

  const commit = () => {
    const parsed = parseInt(draft, 10);
    if (!Number.isFinite(parsed)) {
      setDraft(String(value));
      return;
    }
    const clamped = Math.min(Math.max(parsed, min), max);
    setDraft(String(clamped));
    if (clamped !== value) onCommit(clamped);
  };

  return (
    <div>
      <label className="text-sm font-medium text-gray-800">{label}</label>
      {hint ? <p className="mt-0.5 text-xs text-gray-500">{hint}</p> : null}
      <div className="mt-1.5 flex items-center gap-2">
        <Input
          type="number"
          value={draft}
          min={min}
          max={max}
          disabled={disabled}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === "Enter" && commit()}
          className="w-24 rounded-md"
        />
        {suffix ? <span className="text-sm text-gray-500">{suffix}</span> : null}
      </div>
    </div>
  );
}

function SettingsTab({
  config,
  saving,
  onSave,
}: {
  config: DomestiqueConfig;
  saving: boolean;
  onSave: (update: DomestiqueConfigUpdate) => void;
}) {
  const [briefPhone, setBriefPhone] = React.useState(config.brief_phone ?? "");
  React.useEffect(() => setBriefPhone(config.brief_phone ?? ""), [config.brief_phone]);

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">The Domestique is {config.is_enabled ? "on" : "off"}</h3>
            <p className="mt-0.5 text-xs text-gray-500">
              When on, the agent runs nightly at {String(config.run_hour).padStart(2, "0")}:00 ({config.timezone}) and
              proposes plays from your Lightspeed data.
            </p>
          </div>
          <Switch
            checked={config.is_enabled}
            disabled={saving}
            onCheckedChange={(checked) => onSave({ is_enabled: checked })}
          />
        </div>
      </div>

      <section className="space-y-2">
        <h3 className="text-sm font-medium text-gray-900">Autonomy</h3>
        <div className="grid gap-3 md:grid-cols-3">
          {MODE_OPTIONS.map((mode) => (
            <button
              key={mode.id}
              type="button"
              disabled={saving}
              onClick={() => onSave({ mode: mode.id })}
              className={cn(
                "rounded-md border p-3 text-left transition-colors",
                config.mode === mode.id
                  ? "border-gray-800 bg-white"
                  : "border-gray-200 bg-white hover:border-gray-300",
              )}
            >
              <p className="text-sm font-semibold text-gray-900">{mode.label}</p>
              <p className="mt-1 text-xs text-gray-500">{mode.description}</p>
            </button>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <h3 className="text-sm font-medium text-gray-900">Guardrails</h3>
        <div className="grid gap-4 md:grid-cols-2">
          <NumberField
            label="Plays per day"
            hint="Most plays proposed in one morning brief."
            value={config.max_plays_per_day}
            min={1}
            max={10}
            disabled={saving}
            onCommit={(v) => onSave({ max_plays_per_day: v })}
          />
          <NumberField
            label="Contact budget"
            hint="Days between marketing touches for one customer, email and text combined."
            value={config.contact_cooldown_days}
            min={1}
            max={90}
            suffix="days"
            disabled={saving}
            onCommit={(v) => onSave({ contact_cooldown_days: v })}
          />
          <NumberField
            label="Holdout"
            hint="Share of each audience withheld so receipts show honest lift."
            value={config.holdout_percent}
            min={0}
            max={50}
            suffix="%"
            disabled={saving}
            onCommit={(v) => onSave({ holdout_percent: v })}
          />
          <NumberField
            label="Attribution window"
            hint="How long after a touch a purchase still counts."
            value={config.attribution_window_days}
            min={1}
            max={60}
            suffix="days"
            disabled={saving}
            onCommit={(v) => onSave({ attribution_window_days: v })}
          />
          <NumberField
            label="Texts per play"
            hint="Hard cap on Nest messages a single play can send."
            value={config.max_sms_per_play}
            min={0}
            max={200}
            disabled={saving}
            onCommit={(v) => onSave({ max_sms_per_play: v })}
          />
          <NumberField
            label="Max discount"
            hint="Ceiling for dead-stock discounts."
            value={config.max_discount_percent}
            min={5}
            max={70}
            suffix="%"
            disabled={saving}
            onCommit={(v) => onSave({ max_discount_percent: v })}
          />
          <NumberField
            label="Margin floor"
            hint="Discounts are capped so margin never drops below this."
            value={config.min_margin_floor_percent}
            min={0}
            max={60}
            suffix="%"
            disabled={saving}
            onCommit={(v) => onSave({ min_margin_floor_percent: v })}
          />
          <NumberField
            label="Nightly run hour"
            hint="Store-local hour the agent wakes up."
            value={config.run_hour}
            min={0}
            max={23}
            suffix=":00"
            disabled={saving}
            onCommit={(v) => onSave({ run_hour: v })}
          />
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-medium text-gray-900">Morning brief</h3>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-gray-800">Text me the brief via Nest</p>
              <p className="mt-0.5 text-xs text-gray-500">
                One text each morning listing the day's plays and their estimated value.
              </p>
            </div>
            <Switch
              checked={config.send_brief_via_nest}
              disabled={saving}
              onCheckedChange={(checked) => onSave({ send_brief_via_nest: checked })}
            />
          </div>
          {config.send_brief_via_nest ? (
            <div className="mt-3 flex items-center gap-2">
              <Input
                value={briefPhone}
                placeholder="+61 400 000 000"
                disabled={saving}
                onChange={(e) => setBriefPhone(e.target.value)}
                className="max-w-xs rounded-md"
              />
              <Button
                size="sm"
                variant="outline"
                className="rounded-md"
                disabled={saving || briefPhone.trim() === (config.brief_phone ?? "")}
                onClick={() => onSave({ brief_phone: briefPhone.trim() || null })}
              >
                Save number
              </Button>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}

// ------------------------------------------------------------------
// Page
// ------------------------------------------------------------------

export function StoreDomestiquePageContent() {
  const [activeTab, setActiveTab] = React.useState<DomestiqueTab>("today");
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [running, setRunning] = React.useState(false);
  const [busyOpportunityId, setBusyOpportunityId] = React.useState<string | null>(null);
  const [config, setConfig] = React.useState<DomestiqueConfig | null>(null);
  const [opportunities, setOpportunities] = React.useState<DomestiqueOpportunity[]>([]);
  const [receipts, setReceipts] = React.useState<DomestiqueReceipt[]>([]);
  const [receiptsSummary, setReceiptsSummary] = React.useState<ReceiptsSummary | null>(null);
  const [receiptsLoaded, setReceiptsLoaded] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);

  const loadOpportunities = React.useCallback(async () => {
    const res = await fetch("/api/store/domestique/opportunities?limit=60", { cache: "no-store" });
    if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || "Failed to load plays");
    const data = await res.json();
    setOpportunities((data.opportunities ?? []) as DomestiqueOpportunity[]);
  }, []);

  React.useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [configRes, oppsRes] = await Promise.all([
          fetch("/api/store/domestique/config", { cache: "no-store" }),
          fetch("/api/store/domestique/opportunities?limit=60", { cache: "no-store" }),
        ]);
        if (!active) return;
        if (configRes.ok) {
          const data = await configRes.json();
          setConfig(data.config as DomestiqueConfig);
        } else {
          throw new Error((await configRes.json().catch(() => ({})))?.error || "Failed to load configuration");
        }
        if (oppsRes.ok) {
          const data = await oppsRes.json();
          setOpportunities((data.opportunities ?? []) as DomestiqueOpportunity[]);
        }
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "Failed to load the Domestique");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  React.useEffect(() => {
    if (activeTab !== "receipts" || receiptsLoaded) return;
    (async () => {
      try {
        const res = await fetch("/api/store/domestique/receipts", { cache: "no-store" });
        if (res.ok) {
          const data = await res.json();
          setReceipts((data.receipts ?? []) as DomestiqueReceipt[]);
          setReceiptsSummary((data.summary ?? null) as ReceiptsSummary | null);
        }
      } catch {
        /* best effort */
      } finally {
        setReceiptsLoaded(true);
      }
    })();
  }, [activeTab, receiptsLoaded]);

  const handleSaveConfig = React.useCallback(async (update: DomestiqueConfigUpdate) => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/store/domestique/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(update),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Failed to save settings");
      setConfig(data.config as DomestiqueConfig);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save settings");
    } finally {
      setSaving(false);
    }
  }, []);

  const handleRunNow = React.useCallback(async () => {
    setRunning(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/store/domestique/run", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Run failed");
      const proposed = data.summary?.proposed ?? 0;
      setNotice(
        proposed > 0
          ? `Run complete — ${proposed} ${proposed === 1 ? "play" : "plays"} proposed.`
          : "Run complete — no new opportunities right now.",
      );
      await loadOpportunities();
      setActiveTab("today");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Run failed");
    } finally {
      setRunning(false);
    }
  }, [loadOpportunities]);

  const handleOpportunityAction = React.useCallback(
    async (id: string, action: "approve" | "skip") => {
      setBusyOpportunityId(id);
      setError(null);
      try {
        const res = await fetch(`/api/store/domestique/opportunities/${id}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error || "Failed to action the play");
        await loadOpportunities();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to action the play");
      } finally {
        setBusyOpportunityId(null);
      }
    },
    [loadOpportunities],
  );

  const handleOpportunityEdit = React.useCallback(
    async (id: string, payload: EditPayload): Promise<boolean> => {
      setBusyOpportunityId(id);
      setError(null);
      try {
        const res = await fetch(`/api/store/domestique/opportunities/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error || "Failed to save changes");
        setOpportunities((prev) =>
          prev.map((opp) => (opp.id === id ? (data.opportunity as DomestiqueOpportunity) : opp)),
        );
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save changes");
        return false;
      } finally {
        setBusyOpportunityId(null);
      }
    },
    [],
  );

  return (
    <DashboardFloatingPage
      title="Domestique"
      icon={Sparkles}
      description="Your background revenue agent — it reads your Lightspeed data every night, finds the money leaking out, and acts through email, Nest texts and storefront discounts. You approve; it rides."
      flush
      actions={
        <Button
          size="sm"
          variant="outline"
          className="rounded-full"
          onClick={handleRunNow}
          disabled={running || loading || !config?.is_enabled}
        >
          <RefreshCw className={cn("size-4", running && "animate-spin")} />
          {running ? "Running…" : "Run now"}
        </Button>
      }
      toolbar={
        <SettingsNavTabs
          items={TABS}
          value={activeTab}
          onChange={setActiveTab}
          layoutId="domestique-main-tabs"
        />
      }
    >
      <div className="space-y-6 p-4 md:p-5">
        {error ? (
          <div className="rounded-xl border border-red-200 bg-white px-4 py-3 text-sm text-red-700">{error}</div>
        ) : null}
        {notice ? (
          <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700">{notice}</div>
        ) : null}

        {loading || !config ? (
          <SettingsManagerLoading className="min-h-72" />
        ) : !config.is_enabled && activeTab === "today" ? (
          <div className="rounded-xl border border-gray-200 bg-white p-6 text-center">
            <Sparkles className="mx-auto size-8 text-gray-400" />
            <h2 className="mt-3 text-sm font-semibold text-gray-900">The Domestique is off</h2>
            <p className="mx-auto mt-1 max-w-md text-sm text-gray-500">
              Turn it on and it will run every night — finding riders due a service, VIPs gone quiet and stock that
              needs clearing, then proposing plays for your one-tap approval.
            </p>
            <Button className="mt-4 rounded-full" disabled={saving} onClick={() => handleSaveConfig({ is_enabled: true })}>
              Turn on the Domestique
            </Button>
          </div>
        ) : activeTab === "today" ? (
          <TodayTab
            opportunities={opportunities}
            busyId={busyOpportunityId}
            onAction={handleOpportunityAction}
            onEdit={handleOpportunityEdit}
          />
        ) : activeTab === "playbooks" ? (
          <PlaybooksTab config={config} saving={saving} onSave={handleSaveConfig} />
        ) : activeTab === "receipts" ? (
          <ReceiptsTab receipts={receipts} summary={receiptsSummary} />
        ) : (
          <SettingsTab config={config} saving={saving} onSave={handleSaveConfig} />
        )}
      </div>
    </DashboardFloatingPage>
  );
}
