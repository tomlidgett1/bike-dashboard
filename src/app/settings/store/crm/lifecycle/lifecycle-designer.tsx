"use client";

// The campaign design studio for one lifecycle program — a full-page
// experience, same as creating a campaign from scratch.
//
// Left rail: AI designer, subject, layout picker, copy, products.
// Right: the email at real size, updating live. Saving locks the design
// in — every future send of this program uses it verbatim.

import * as React from "react";
import { createPortal } from "react-dom";
import {
  Letter,
  Loader2,
  MagicStick3,
  Trash2,
  X,
} from "@/components/layout/app-sidebar/dashboard-icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { applyMergeTags } from "@/lib/crm/merge-tags";
import { renderCampaignEmail, type StoreBranding } from "@/lib/crm/templates";
import type { CampaignContent, CampaignItem } from "@/lib/crm/types";
import type { CrmEmailTemplateRecord } from "@/lib/crm/agent/chat-types";
import { mergeDraftOntoTemplateContent } from "@/lib/crm/lifecycle/template-config";
import type { LifecycleEmailDraft, LifecycleProgram } from "@/lib/crm/lifecycle/types";
import { LightspeedProductPicker } from "../lightspeed-product-picker";
import { STAGE_LABELS } from "./lifecycle-shared";
import {
  LifecycleTemplatePicker,
  type LifecycleTemplateChoice,
} from "./lifecycle-template-picker";

const PREVIEW_UNSUBSCRIBE_PLACEHOLDER = "https://example.com/unsubscribe-preview";

export type DesignerDraft = {
  subject: string;
  title: string;
  body: string;
  ctaText?: string;
  ctaUrl?: string;
  templateKey: string;
  templateLabel: string | null;
  content: CampaignContent;
};

type ChatEntry = { role: "user" | "assistant"; content: string };

/** Generic starting copy when a program has never been designed or sent. */
export function defaultDesignerDraft(
  program: LifecycleProgram,
  storeName: string,
): DesignerDraft {
  const base = {
    subject: `A note from ${storeName}`,
    title: "From the shop",
    body: `Hi {{FIRST_NAME}},\n\nJust a quick note from the team — drop in any time, the workshop and the floor are always open.`,
    ctaText: "Visit the store",
    templateKey: "store_announcement",
  };
  const content = mergeDraftOntoTemplateContent(base, null);
  return { ...base, templateLabel: null, content };
}

export function draftFromEmail(email: LifecycleEmailDraft): DesignerDraft {
  return {
    subject: email.subject,
    title: email.title,
    body: email.body,
    ctaText: email.ctaText,
    ctaUrl: email.ctaUrl,
    templateKey: email.templateKey,
    templateLabel: email.templateLabel ?? null,
    content: mergeDraftOntoTemplateContent(email, email.content),
  };
}

function RailSection({
  title,
  children,
}: {
  title: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border/60 bg-white p-4">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {title}
      </p>
      <div className="mt-2.5">{children}</div>
    </section>
  );
}

export function LifecycleDesigner({
  program,
  seedEmail,
  store,
  savedTemplates,
  premadeTemplates,
  open,
  onOpenChange,
  onSaved,
  onNotice,
}: {
  program: LifecycleProgram;
  /** Best available starting point: saved custom design or latest composed email. */
  seedEmail: LifecycleEmailDraft | null;
  store: StoreBranding;
  savedTemplates: CrmEmailTemplateRecord[];
  premadeTemplates: CrmEmailTemplateRecord[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  onNotice: (notice: { kind: "success" | "error"; text: string }) => void;
}) {
  const [draft, setDraft] = React.useState<DesignerDraft>(() =>
    seedEmail ? draftFromEmail(seedEmail) : defaultDesignerDraft(program, store.name),
  );
  const [subjectVariants, setSubjectVariants] = React.useState<string[]>([]);
  const [chat, setChat] = React.useState<ChatEntry[]>([]);
  const [prompt, setPrompt] = React.useState("");
  const [aiBusy, setAiBusy] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [clearing, setClearing] = React.useState(false);

  // Re-seed when opening for a (possibly different) program.
  React.useEffect(() => {
    if (!open) return;
    setDraft(seedEmail ? draftFromEmail(seedEmail) : defaultDesignerDraft(program, store.name));
    setChat([]);
    setPrompt("");
    setSubjectVariants([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, program.id]);

  const isHtmlDesign = draft.content.design?.mode === "html";

  const deferredDraft = React.useDeferredValue(draft);
  const previewHtml = React.useMemo(() => {
    const { html } = renderCampaignEmail({
      templateKey: deferredDraft.templateKey,
      content: mergeDraftOntoTemplateContent(deferredDraft, deferredDraft.content),
      store,
      unsubscribeUrl: PREVIEW_UNSUBSCRIBE_PLACEHOLDER,
    });
    return applyMergeTags(html, { firstName: null });
  }, [deferredDraft, store]);

  const update = (patch: Partial<DesignerDraft>) => {
    setDraft((prev) => {
      const next = { ...prev, ...patch };
      next.content = mergeDraftOntoTemplateContent(next, patch.content ?? prev.content);
      return next;
    });
  };

  const applyTemplateChoice = (choice: LifecycleTemplateChoice) => {
    // Picking a layout/template always leaves html mode — copy is preserved.
    const baseContent =
      choice.content && choice.content.design?.mode !== "html" ? choice.content : null;
    const content = mergeDraftOntoTemplateContent(
      { title: draft.title, body: draft.body, ctaText: draft.ctaText, ctaUrl: draft.ctaUrl },
      baseContent,
    );
    setDraft((prev) => ({
      ...prev,
      templateKey: choice.templateKey,
      templateLabel: choice.templateLabel,
      content: { ...content, items: prev.content.items },
    }));
  };

  const askAi = async () => {
    const message = prompt.trim();
    if (!message || aiBusy) return;
    setAiBusy(true);
    setChat((prev) => [...prev, { role: "user", content: message }]);
    setPrompt("");
    try {
      const res = await fetch(`/api/store/crm/lifecycle/programs/${program.id}/design`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          draft: {
            subject: draft.subject,
            templateKey: draft.templateKey,
            content: draft.content,
          },
          conversation: chat.slice(-8),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "AI design failed");
      setDraft((prev) => ({
        ...prev,
        subject: String(data.subject ?? prev.subject),
        title: String(data.content?.title ?? prev.title),
        body: String(data.content?.body ?? prev.body),
        ctaText: data.content?.ctaText ?? prev.ctaText,
        ctaUrl: data.content?.ctaUrl ?? prev.ctaUrl,
        templateKey: String(data.templateKey ?? prev.templateKey),
        templateLabel: "AI design",
        content: (data.content ?? prev.content) as CampaignContent,
      }));
      setSubjectVariants((data.subjectVariants ?? []).slice(1));
      setChat((prev) => [
        ...prev,
        { role: "assistant", content: String(data.summary ?? "Updated the design.") },
      ]);
    } catch (error) {
      const text = error instanceof Error ? error.message : "AI design failed";
      setChat((prev) => [...prev, { role: "assistant", content: `Sorry — ${text}` }]);
    } finally {
      setAiBusy(false);
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/store/crm/lifecycle/programs/${program.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          config: {
            custom_email: {
              subject: draft.subject,
              templateKey: draft.templateKey,
              templateLabel: draft.templateLabel,
              content: mergeDraftOntoTemplateContent(draft, draft.content),
            },
          },
        }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || "Save failed");
      onNotice({
        kind: "success",
        text: `${program.name} will now use your design for every send.`,
      });
      onSaved();
      onOpenChange(false);
    } catch (error) {
      onNotice({ kind: "error", text: error instanceof Error ? error.message : "Save failed" });
    } finally {
      setSaving(false);
    }
  };

  const clearCustom = async () => {
    setClearing(true);
    try {
      const res = await fetch(`/api/store/crm/lifecycle/programs/${program.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config: { custom_email: null } }),
      });
      if (!res.ok) throw new Error("Could not reset");
      onNotice({
        kind: "success",
        text: `${program.name} is back to automatic copy — the engine writes a fresh email each send and keeps improving it.`,
      });
      onSaved();
      onOpenChange(false);
    } catch (error) {
      onNotice({ kind: "error", text: error instanceof Error ? error.message : "Reset failed" });
    } finally {
      setClearing(false);
    }
  };

  const removeProduct = (index: number) => {
    setDraft((prev) => {
      const items = [...(prev.content.items ?? [])];
      items.splice(index, 1);
      return { ...prev, content: { ...prev.content, items: items.length ? items : undefined } };
    });
  };

  const addProduct = (item: CampaignItem) => {
    setDraft((prev) => ({
      ...prev,
      content: { ...prev.content, items: [...(prev.content.items ?? []), item] },
    }));
  };

  if (!open) return null;

  // Portalled to <body>: ancestors inside the dashboard shell use transforms,
  // which would trap position:fixed and leave the app chrome visible.
  return createPortal(
    <div className="fixed inset-0 z-50 flex flex-col bg-zinc-50">
      {/* Header */}
      <header className="flex shrink-0 items-center gap-3 border-b border-border/60 bg-white px-5 py-3">
        <button
          type="button"
          onClick={() => !saving && !aiBusy && onOpenChange(false)}
          className="flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-zinc-100 hover:text-foreground"
          aria-label="Close designer"
        >
          <X className="size-4" />
        </button>
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold text-foreground">
            {program.name} — design the email
          </h2>
          <p className="truncate text-xs text-muted-foreground">
            Goes to {STAGE_LABELS[program.stage].toLowerCase()} customers ·{" "}
            {"{{FIRST_NAME}}"} becomes each customer&apos;s real name
          </p>
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="hidden text-muted-foreground sm:inline-flex"
            onClick={() => void clearCustom()}
            disabled={saving || clearing || aiBusy}
          >
            {clearing ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : null}
            Use automatic copy
          </Button>
          <Button
            size="sm"
            className="rounded-full px-5"
            onClick={() => void save()}
            disabled={saving || clearing || aiBusy || !draft.subject.trim()}
          >
            {saving ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : null}
            Save design
          </Button>
        </div>
      </header>

      {/* Body */}
      <div className="min-h-0 flex-1 overflow-y-auto lg:overflow-hidden">
        <div className="mx-auto flex h-full max-w-[1500px] flex-col gap-6 p-6 lg:flex-row">
          {/* Left rail — controls */}
          <div className="w-full space-y-4 lg:w-[400px] lg:shrink-0 lg:overflow-y-auto lg:pb-6 lg:pr-1">
            {/* AI */}
            <RailSection
              title={
                <>
                  <MagicStick3 className="mr-1 inline size-3.5 align-[-2px]" />
                  Design with AI
                </>
              }
            >
              {chat.length > 0 ? (
                <div className="mb-2.5 max-h-48 space-y-1.5 overflow-y-auto">
                  {chat.map((entry, index) => (
                    <p
                      key={index}
                      className={cn(
                        "rounded-md px-2.5 py-1.5 text-xs leading-relaxed",
                        entry.role === "user"
                          ? "bg-zinc-900 text-white"
                          : "bg-gray-100 text-foreground",
                      )}
                    >
                      {entry.content}
                    </p>
                  ))}
                  {aiBusy ? (
                    <p className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-muted-foreground">
                      <Loader2 className="size-3 animate-spin" /> Designing…
                    </p>
                  ) : null}
                </div>
              ) : null}
              <div className="flex gap-2">
                <Textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void askAi();
                    }
                  }}
                  rows={2}
                  placeholder={`e.g. "Premium and personal — dark header, add a workshop section"`}
                  className="min-h-0 flex-1 resize-none bg-white text-sm"
                />
                <Button
                  size="sm"
                  className="self-end rounded-full"
                  onClick={() => void askAi()}
                  disabled={aiBusy || !prompt.trim()}
                >
                  {aiBusy ? <Loader2 className="size-3.5 animate-spin" /> : "Go"}
                </Button>
              </div>
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                The AI redesigns the whole email — layout, colours, sections and words. Keep
                asking until it&apos;s right.
              </p>
            </RailSection>

            {/* Subject */}
            <RailSection title="Subject line">
              <Input
                value={draft.subject}
                onChange={(e) => update({ subject: e.target.value })}
                className="h-9"
              />
              {subjectVariants.length > 0 ? (
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {subjectVariants.map((variant) => (
                    <button
                      key={variant}
                      type="button"
                      onClick={() => update({ subject: variant })}
                      className="rounded-md border border-border/60 bg-gray-50 px-2 py-1 text-left text-[11px] text-muted-foreground transition-colors hover:bg-gray-100"
                      title="Use this subject instead"
                    >
                      Or: “{variant}”
                    </button>
                  ))}
                </div>
              ) : null}
            </RailSection>

            {/* Design + copy */}
            <RailSection title="Design & words">
              <LifecycleTemplatePicker
                currentLabel={draft.templateLabel}
                currentKey={draft.templateKey}
                selectedId={draft.templateLabel === "AI design" ? null : draft.templateKey}
                savedTemplates={savedTemplates}
                premadeTemplates={premadeTemplates}
                onSelect={applyTemplateChoice}
              />

              {isHtmlDesign ? (
                <p className="mt-3 rounded-md bg-gray-50 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
                  This is a custom AI design. To change the words or sections, ask the AI above —
                  it edits the design directly. Picking a layout switches back to simple mode.
                </p>
              ) : (
                <div className="mt-3 space-y-3">
                  <div>
                    <Label className="text-xs">Headline</Label>
                    <Input
                      value={draft.title}
                      onChange={(e) => update({ title: e.target.value })}
                      className="mt-1 h-9"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Message</Label>
                    <Textarea
                      value={draft.body}
                      onChange={(e) => update({ body: e.target.value })}
                      rows={8}
                      className="mt-1 resize-none text-sm"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs">Button text</Label>
                      <Input
                        value={draft.ctaText ?? ""}
                        onChange={(e) => update({ ctaText: e.target.value })}
                        className="mt-1 h-9"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Button link</Label>
                      <Input
                        value={draft.ctaUrl ?? ""}
                        onChange={(e) => update({ ctaUrl: e.target.value })}
                        placeholder="Your storefront"
                        className="mt-1 h-9"
                      />
                    </div>
                  </div>
                </div>
              )}
            </RailSection>

            {/* Products */}
            <RailSection title="Featured products">
              {(draft.content.items ?? []).length > 0 ? (
                <ul className="mb-2.5 space-y-1.5">
                  {(draft.content.items ?? []).map((item, index) => (
                    <li
                      key={`${item.title}-${index}`}
                      className="flex items-center gap-2 rounded-md border border-border/50 bg-white px-2.5 py-1.5"
                    >
                      {item.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={item.imageUrl}
                          alt=""
                          className="size-8 shrink-0 rounded object-cover"
                        />
                      ) : (
                        <span className="flex size-8 shrink-0 items-center justify-center rounded bg-gray-100">
                          <Letter className="size-3.5 text-gray-400" />
                        </span>
                      )}
                      <span className="min-w-0 flex-1 truncate text-xs text-foreground">
                        {item.title}
                        {item.price ? (
                          <span className="ml-1.5 text-muted-foreground">{item.price}</span>
                        ) : null}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeProduct(index)}
                        aria-label={`Remove ${item.title}`}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
              <LightspeedProductPicker onSelect={addProduct} />
              {isHtmlDesign && (draft.content.items ?? []).length > 0 ? (
                <p className="mt-2 text-[11px] text-muted-foreground">
                  After changing products on an AI design, ask the AI to “update the products
                  section” so the artwork matches.
                </p>
              ) : null}
            </RailSection>
          </div>

          {/* Preview — the email at real size */}
          <div className="flex min-h-[540px] w-full min-w-0 flex-1 flex-col lg:min-h-0">
            <div className="mb-2 flex shrink-0 items-baseline justify-between gap-3">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Live preview — exactly what customers receive
              </p>
              <p
                className="min-w-0 truncate text-[11px] text-muted-foreground"
                title={draft.subject}
              >
                Subject: {applyMergeTags(draft.subject, { firstName: null })}
              </p>
            </div>
            <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-border/60 bg-white shadow-sm">
              <iframe
                title={`Design preview for ${program.name}`}
                sandbox=""
                srcDoc={previewHtml}
                className="h-full min-h-[500px] w-full bg-white"
              />
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
