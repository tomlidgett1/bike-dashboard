"use client";

// Campaign composer — full-screen overlay with four calm steps:
// Template → Customize (live preview) → Recipients → Review & send.
//
// The preview renders the exact production HTML (renderCampaignEmail) in a
// sandboxed iframe; only the per-recipient unsubscribe link differs at send.

import * as React from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  Loader2,
  Plus,
  Send,
  Trash2,
  X,
} from "@/components/layout/app-sidebar/dashboard-icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  CRM_TEMPLATES,
  getCrmTemplate,
  renderCampaignEmail,
  type StoreBranding,
} from "@/lib/crm/templates";
import type { CampaignContent, CampaignItem, CrmContact } from "@/lib/crm/types";

export type ComposerSeed = {
  templateKey: string | null;
  subject: string | null;
  content: CampaignContent | null;
};

type Step = "template" | "customize" | "recipients" | "review";
const STEPS: { id: Step; label: string }[] = [
  { id: "template", label: "Template" },
  { id: "customize", label: "Customize" },
  { id: "recipients", label: "Recipients" },
  { id: "review", label: "Review & send" },
];

type SendOutcome = {
  sent: number;
  failed: number;
  skippedOptedOut: number;
  skippedInvalid: number;
};

const PREVIEW_UNSUBSCRIBE_PLACEHOLDER = "https://yellowjersey.store/unsubscribe?token=preview";

export function CampaignComposer(props: {
  seed: ComposerSeed;
  senderEmail: string | null;
  store: StoreBranding;
  eligibleCount: number;
  selectedContacts: CrmContact[];
  onClose: () => void;
  onSent: () => void;
}) {
  const { seed, senderEmail, store, eligibleCount, selectedContacts, onClose, onSent } = props;

  const eligibleSelected = selectedContacts.filter((contact) => !contact.opted_out);
  const optedOutSelected = selectedContacts.length - eligibleSelected.length;
  const hasSelection = selectedContacts.length > 0;

  const [step, setStep] = React.useState<Step>(seed.templateKey ? "customize" : "template");
  const [templateKey, setTemplateKey] = React.useState<string | null>(seed.templateKey);
  const [subject, setSubject] = React.useState(seed.subject ?? "");
  const [content, setContent] = React.useState<CampaignContent>(
    seed.content ?? { title: "", body: "" },
  );
  const [recipientMode, setRecipientMode] = React.useState<"all" | "selected">(
    hasSelection ? "selected" : "all",
  );
  const [sending, setSending] = React.useState(false);
  const [sendError, setSendError] = React.useState<string | null>(null);
  const [outcome, setOutcome] = React.useState<SendOutcome | null>(null);

  const template = templateKey ? getCrmTemplate(templateKey) : null;

  const chooseTemplate = (key: string) => {
    const nextTemplate = getCrmTemplate(key);
    if (!nextTemplate) return;
    setTemplateKey(key);
    // Only prefill when starting fresh — duplicating keeps the existing copy.
    if (!seed.content && !String(content.title ?? "").trim()) {
      setSubject((prev) => prev || nextTemplate.defaults.subject);
      setContent(structuredClone(nextTemplate.defaults.content));
    }
    setStep("customize");
  };

  const updateContent = (patch: Partial<CampaignContent>) =>
    setContent((prev) => ({ ...prev, ...patch }));

  const updateItem = (index: number, patch: Partial<CampaignItem>) =>
    setContent((prev) => {
      const items = [...(prev.items ?? [])];
      items[index] = { ...items[index], ...patch };
      return { ...prev, items };
    });

  const recipientCount = recipientMode === "all" ? eligibleCount : eligibleSelected.length;
  const customizeValid =
    subject.trim().length > 0 &&
    String(content.title ?? "").trim().length > 0 &&
    String(content.body ?? "").trim().length > 0;
  const canSend = customizeValid && Boolean(senderEmail) && recipientCount > 0 && !sending;

  const deferredContent = React.useDeferredValue(content);
  const deferredTemplateKey = React.useDeferredValue(templateKey);
  const previewHtml = React.useMemo(() => {
    if (!deferredTemplateKey) return "";
    return renderCampaignEmail({
      templateKey: deferredTemplateKey,
      content: deferredContent,
      store,
      unsubscribeUrl: PREVIEW_UNSUBSCRIBE_PLACEHOLDER,
    }).html;
  }, [deferredTemplateKey, deferredContent, store]);

  const send = async () => {
    if (!templateKey || !canSend) return;
    setSending(true);
    setSendError(null);
    try {
      const createRes = await fetch("/api/store/crm/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: subject.trim(),
          templateKey,
          content,
          recipientMode,
          contactIds:
            recipientMode === "selected"
              ? eligibleSelected.map((contact) => contact.id)
              : undefined,
        }),
      });
      const created = await createRes.json().catch(() => ({}));
      if (!createRes.ok) throw new Error(created?.error || "Failed to create campaign");

      const sendRes = await fetch(`/api/store/crm/campaigns/${created.campaignId}/send`, {
        method: "POST",
      });
      const result = await sendRes.json().catch(() => ({}));
      if (!sendRes.ok) throw new Error(result?.error || "Send failed");

      setOutcome({
        sent: result.sent ?? 0,
        failed: result.failed ?? 0,
        skippedOptedOut: result.skippedOptedOut ?? 0,
        skippedInvalid: result.skippedInvalid ?? 0,
      });
    } catch (error) {
      setSendError(error instanceof Error ? error.message : "Send failed");
    } finally {
      setSending(false);
    }
  };

  const stepIndex = STEPS.findIndex((entry) => entry.id === step);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-zinc-50">
      {/* Header */}
      <header className="flex shrink-0 items-center gap-4 border-b border-border/60 bg-white px-5 py-3">
        <button
          type="button"
          onClick={onClose}
          className="flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-zinc-100 hover:text-foreground"
          aria-label="Close composer"
        >
          <X className="size-4" />
        </button>
        <h2 className="text-sm font-semibold text-foreground">New campaign</h2>
        {!outcome ? (
          <nav className="mx-auto hidden items-center gap-1 sm:flex">
            {STEPS.map((entry, index) => {
              const reachable =
                index <= stepIndex || (index === stepIndex + 1 && (index !== 1 ? true : Boolean(template)));
              return (
                <React.Fragment key={entry.id}>
                  {index > 0 ? <span className="mx-1 h-px w-6 bg-border" /> : null}
                  <button
                    type="button"
                    disabled={!reachable || (entry.id !== "template" && !template)}
                    onClick={() => setStep(entry.id)}
                    className={cn(
                      "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                      step === entry.id
                        ? "bg-zinc-900 text-white"
                        : index < stepIndex
                          ? "text-foreground hover:bg-zinc-100"
                          : "text-muted-foreground",
                      !reachable && "cursor-default",
                    )}
                  >
                    {entry.label}
                  </button>
                </React.Fragment>
              );
            })}
          </nav>
        ) : null}
        <div className="ml-auto" />
      </header>

      {/* Body */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {outcome ? (
          <SuccessView outcome={outcome} onDone={onSent} />
        ) : step === "template" ? (
          <TemplateStep selectedKey={templateKey} store={store} onChoose={chooseTemplate} />
        ) : step === "customize" && template ? (
          <div className="mx-auto flex h-full max-w-6xl flex-col gap-6 p-6 lg:flex-row">
            <div className="w-full space-y-5 lg:w-105 lg:shrink-0 lg:overflow-y-auto lg:pr-1">
              <Field label="Subject line" required>
                <Input
                  value={subject}
                  onChange={(event) => setSubject(event.target.value)}
                  placeholder="What lands in the inbox"
                />
              </Field>
              <Field label="Header / title" required>
                <Input
                  value={content.title ?? ""}
                  onChange={(event) => updateContent({ title: event.target.value })}
                />
              </Field>
              <Field label="Body copy" required hint="Blank lines create paragraphs.">
                <Textarea
                  rows={6}
                  value={content.body ?? ""}
                  onChange={(event) => updateContent({ body: event.target.value })}
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Button text">
                  <Input
                    value={content.ctaText ?? ""}
                    onChange={(event) => updateContent({ ctaText: event.target.value })}
                    placeholder="Shop now"
                  />
                </Field>
                <Field label="Button link">
                  <Input
                    value={content.ctaUrl ?? ""}
                    onChange={(event) => updateContent({ ctaUrl: event.target.value })}
                    placeholder="https://…"
                  />
                </Field>
              </div>
              <Field label="Hero image URL" hint="Optional. Shown full-width above the title.">
                <Input
                  value={content.heroImageUrl ?? ""}
                  onChange={(event) => updateContent({ heroImageUrl: event.target.value })}
                  placeholder="https://…"
                />
              </Field>

              {template.supportsItems ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-medium text-muted-foreground">
                      Featured items
                    </Label>
                    {(content.items?.length ?? 0) < 4 ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          updateContent({ items: [...(content.items ?? []), { title: "" }] })
                        }
                      >
                        <Plus className="mr-1 size-3.5" />
                        Add item
                      </Button>
                    ) : null}
                  </div>
                  {(content.items ?? []).map((item, index) => (
                    <div
                      key={index}
                      className="space-y-2 rounded-2xl border border-border/60 bg-white p-3"
                    >
                      <div className="flex items-center gap-2">
                        <Input
                          value={item.title}
                          onChange={(event) => updateItem(index, { title: event.target.value })}
                          placeholder="Item name"
                          className="h-8"
                        />
                        <Input
                          value={item.price ?? ""}
                          onChange={(event) => updateItem(index, { price: event.target.value })}
                          placeholder="$1,299"
                          className="h-8 w-28"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            updateContent({
                              items: (content.items ?? []).filter((_, i) => i !== index),
                            })
                          }
                          className="shrink-0 text-muted-foreground hover:text-foreground"
                          aria-label="Remove item"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                      <Input
                        value={item.subtitle ?? ""}
                        onChange={(event) => updateItem(index, { subtitle: event.target.value })}
                        placeholder="Short description (optional)"
                        className="h-8"
                      />
                      <div className="flex gap-2">
                        <Input
                          value={item.imageUrl ?? ""}
                          onChange={(event) => updateItem(index, { imageUrl: event.target.value })}
                          placeholder="Image URL"
                          className="h-8"
                        />
                        <Input
                          value={item.url ?? ""}
                          onChange={(event) => updateItem(index, { url: event.target.value })}
                          placeholder="Link URL"
                          className="h-8"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}

              <Field label="Footer text">
                <Input
                  value={content.footerText ?? ""}
                  onChange={(event) => updateContent({ footerText: event.target.value })}
                />
              </Field>
              <p className="text-xs text-muted-foreground">
                An unsubscribe link is added to every email automatically.
              </p>
            </div>

            <div className="min-h-96 flex-1 overflow-hidden rounded-2xl border border-border/60 bg-white shadow-sm">
              {/* allow-same-origin (scripts stay blocked): a fully empty sandbox
                  stops Chrome painting srcdoc iframes rendered by React. */}
              <iframe
                title="Email preview"
                sandbox="allow-same-origin"
                srcDoc={previewHtml}
                className="h-full min-h-96 w-full"
              />
            </div>
          </div>
        ) : step === "recipients" ? (
          <div className="mx-auto max-w-xl space-y-3 p-6 pt-10">
            <h3 className="text-lg font-semibold tracking-tight text-foreground">
              Who should receive this?
            </h3>
            <p className="text-sm text-muted-foreground">
              Opted-out contacts and invalid emails are always excluded automatically.
            </p>
            <div className="space-y-2 pt-2">
              <RecipientOption
                active={recipientMode === "all"}
                onClick={() => setRecipientMode("all")}
                title="All subscribed contacts"
                subtitle={`${eligibleCount.toLocaleString()} contact${eligibleCount === 1 ? "" : "s"} currently eligible`}
              />
              {hasSelection ? (
                <RecipientOption
                  active={recipientMode === "selected"}
                  onClick={() => setRecipientMode("selected")}
                  title="Only the contacts I selected"
                  subtitle={`${eligibleSelected.length.toLocaleString()} eligible selected${
                    optedOutSelected > 0
                      ? ` · ${optedOutSelected} opted out and will be excluded`
                      : ""
                  }`}
                />
              ) : (
                <p className="pt-1 text-xs text-muted-foreground">
                  Tip: select individual contacts on the Contacts tab first to target a smaller
                  group.
                </p>
              )}
            </div>
          </div>
        ) : (
          <ReviewStep
            subject={subject}
            templateName={template?.name ?? ""}
            senderEmail={senderEmail}
            recipientCount={recipientCount}
            optedOutSelected={recipientMode === "selected" ? optedOutSelected : 0}
            customizeValid={customizeValid}
            sendError={sendError}
          />
        )}
      </div>

      {/* Footer */}
      {!outcome ? (
        <footer className="flex shrink-0 items-center justify-between border-t border-border/60 bg-white px-5 py-3">
          <div>
            {step !== "template" ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setStep(STEPS[Math.max(0, stepIndex - 1)].id)}
                disabled={sending}
              >
                <ChevronLeft className="mr-1 size-4" />
                Back
              </Button>
            ) : null}
          </div>
          <div className="flex items-center gap-3">
            {step === "customize" && !customizeValid ? (
              <span className="text-xs text-muted-foreground">
                Subject, title and body are required
              </span>
            ) : null}
            {step === "review" ? (
              <Button onClick={() => void send()} disabled={!canSend}>
                {sending ? (
                  <Loader2 className="mr-1.5 size-4" />
                ) : (
                  <Send className="mr-1.5 size-4" />
                )}
                {sending
                  ? "Sending…"
                  : `Send to ${recipientCount.toLocaleString()} recipient${recipientCount === 1 ? "" : "s"}`}
              </Button>
            ) : step !== "template" ? (
              <Button
                onClick={() => setStep(STEPS[Math.min(STEPS.length - 1, stepIndex + 1)].id)}
                disabled={step === "customize" && !customizeValid}
              >
                Continue
              </Button>
            ) : null}
          </div>
        </footer>
      ) : null}
    </div>
  );
}

// ============================================================
// Pieces
// ============================================================

function Field(props: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-muted-foreground">
        {props.label}
        {props.required ? <span className="text-red-500"> *</span> : null}
      </Label>
      {props.children}
      {props.hint ? <p className="text-[11px] text-muted-foreground/80">{props.hint}</p> : null}
    </div>
  );
}

function TemplateStep(props: {
  selectedKey: string | null;
  store: StoreBranding;
  onChoose: (key: string) => void;
}) {
  return (
    <div className="mx-auto max-w-4xl p-6 pt-10">
      <h3 className="text-lg font-semibold tracking-tight text-foreground">Choose a template</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Every template carries your store branding and includes an unsubscribe link.
      </p>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {CRM_TEMPLATES.map((template) => {
          const preview = renderCampaignEmail({
            templateKey: template.key,
            content: {
              ...template.defaults.content,
              items:
                template.supportsItems && (template.defaults.content.items?.length ?? 0) === 0
                  ? [
                      { title: "Example item", subtitle: "Short description", price: "$1,299" },
                      { title: "Another item", subtitle: "Short description", price: "$849" },
                    ]
                  : template.defaults.content.items,
            },
            store: props.store,
            unsubscribeUrl: PREVIEW_UNSUBSCRIBE_PLACEHOLDER,
          }).html;
          return (
            <button
              key={template.key}
              type="button"
              onClick={() => props.onChoose(template.key)}
              className={cn(
                "group flex flex-col overflow-hidden rounded-2xl border bg-white text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md",
                props.selectedKey === template.key
                  ? "border-zinc-900 ring-2 ring-zinc-900/10"
                  : "border-border/60",
              )}
            >
              <div className="pointer-events-none h-52 overflow-hidden border-b border-border/40 bg-zinc-50">
                <iframe
                  title={`${template.name} preview`}
                  sandbox="allow-same-origin"
                  srcDoc={preview}
                  tabIndex={-1}
                  className="h-208 w-[200%] origin-top-left scale-50"
                />
              </div>
              <div className="p-4">
                <p className="text-sm font-semibold text-foreground">{template.name}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{template.description}</p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function RecipientOption(props: {
  active: boolean;
  onClick: () => void;
  title: string;
  subtitle: string;
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      className={cn(
        "flex w-full items-center gap-3 rounded-2xl border bg-white p-4 text-left transition-all",
        props.active
          ? "border-zinc-900 ring-2 ring-zinc-900/10"
          : "border-border/60 hover:border-border",
      )}
    >
      <span
        className={cn(
          "flex size-5 shrink-0 items-center justify-center rounded-full border-2",
          props.active ? "border-zinc-900" : "border-zinc-300",
        )}
      >
        {props.active ? <span className="size-2.5 rounded-full bg-zinc-900" /> : null}
      </span>
      <span>
        <span className="block text-sm font-medium text-foreground">{props.title}</span>
        <span className="block text-xs text-muted-foreground">{props.subtitle}</span>
      </span>
    </button>
  );
}

function ReviewStep(props: {
  subject: string;
  templateName: string;
  senderEmail: string | null;
  recipientCount: number;
  optedOutSelected: number;
  customizeValid: boolean;
  sendError: string | null;
}) {
  const rows: { label: string; value: React.ReactNode }[] = [
    { label: "Subject", value: props.subject || "—" },
    { label: "Template", value: props.templateName },
    {
      label: "From",
      value: props.senderEmail ?? (
        <span className="text-red-600">Not configured</span>
      ),
    },
    {
      label: "Recipients",
      value: `${props.recipientCount.toLocaleString()} contact${props.recipientCount === 1 ? "" : "s"}`,
    },
  ];

  return (
    <div className="mx-auto max-w-xl space-y-4 p-6 pt-10">
      <h3 className="text-lg font-semibold tracking-tight text-foreground">Review before sending</h3>
      <div className="overflow-hidden rounded-2xl border border-border/60 bg-white">
        {rows.map((row, index) => (
          <div
            key={row.label}
            className={cn(
              "flex items-baseline justify-between gap-6 px-5 py-3.5",
              index > 0 && "border-t border-border/40",
            )}
          >
            <span className="shrink-0 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {row.label}
            </span>
            <span className="min-w-0 truncate text-sm font-medium text-foreground">{row.value}</span>
          </div>
        ))}
      </div>

      {props.optedOutSelected > 0 ? (
        <Callout kind="warning">
          {props.optedOutSelected} selected contact{props.optedOutSelected === 1 ? " is" : "s are"}{" "}
          opted out and will not receive this email.
        </Callout>
      ) : null}
      {!props.senderEmail ? (
        <Callout kind="error">
          No sender email is configured. Set <code>RESEND_API_KEY</code> and{" "}
          <code>CRM_FROM_EMAIL</code> (see docs/CRM_EMAIL.md), then try again.
        </Callout>
      ) : null}
      {!props.customizeValid ? (
        <Callout kind="error">Subject, title and body content are required before sending.</Callout>
      ) : null}
      {props.recipientCount === 0 ? (
        <Callout kind="error">There are no eligible recipients for this campaign.</Callout>
      ) : null}
      {props.sendError ? <Callout kind="error">{props.sendError}</Callout> : null}

      <p className="text-xs text-muted-foreground">
        Sending is final — a sent campaign can’t be sent again, only duplicated into a new one.
      </p>
    </div>
  );
}

function Callout(props: { kind: "warning" | "error"; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-xl px-4 py-3 text-sm",
        props.kind === "warning"
          ? "bg-amber-50 text-amber-800"
          : "bg-red-50 text-red-700",
      )}
    >
      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
      <span>{props.children}</span>
    </div>
  );
}

function SuccessView(props: { outcome: SendOutcome; onDone: () => void }) {
  const { outcome, onDone } = props;
  const allFailed = outcome.sent === 0;
  return (
    <div className="flex h-full flex-col items-center justify-center gap-5 p-6 text-center">
      <div
        className={cn(
          "flex size-16 items-center justify-center rounded-full",
          allFailed ? "bg-red-100" : "bg-primary",
        )}
      >
        {allFailed ? (
          <AlertTriangle className="size-7 text-red-600" />
        ) : (
          <CheckCircle2 className="size-7 text-primary-foreground" />
        )}
      </div>
      <div>
        <h3 className="text-xl font-semibold tracking-tight text-foreground">
          {allFailed ? "Campaign failed to send" : "Campaign sent"}
        </h3>
        <p className="mt-2 text-sm text-muted-foreground">
          {outcome.sent.toLocaleString()} sent
          {outcome.failed > 0 ? ` · ${outcome.failed} failed` : ""}
          {outcome.skippedOptedOut > 0 ? ` · ${outcome.skippedOptedOut} opted out (skipped)` : ""}
          {outcome.skippedInvalid > 0 ? ` · ${outcome.skippedInvalid} invalid (skipped)` : ""}
        </p>
      </div>
      <Button onClick={onDone}>Done</Button>
    </div>
  );
}
