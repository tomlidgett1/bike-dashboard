"use client";

// CRM 3.0 — fully agentic AI campaign studio (chat · live preview · verified specs).
//
// The left column is a real conversation with a tool-calling agent that looks
// up Lightspeed data, resolves audiences deterministically, verifies its own
// product/customer lookups, asks follow-up questions, and suggests next moves.
// The centre column renders the agent-authored HTML email in inbox chrome with
// a desktop/mobile toggle and a template library. The right column shows only
// verified facts: exact recipient counts with the rule-by-rule funnel, featured
// products, verification checks, subjects, and send controls.

import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronDown,
  Layers,
  Loader2,
  Monitor,
  PanelRightClose,
  PanelRightOpen,
  Search,
  Send,
  Smartphone,
  Sparkles,
  Users,
  Wand2,
  X,
} from "@/components/layout/app-sidebar/dashboard-icons";
import { HomeV2ChatInput } from "@/components/genie/homev2-chat-input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  genieProgressShimmerClassName,
  genieProgressShimmerStyle,
} from "@/lib/genie/shimmer";
import { renderGenieMarkdown } from "@/lib/genie/render-markdown";
import { renderCampaignEmail, type StoreBranding } from "@/lib/crm/templates";
import type { CampaignContent } from "@/lib/crm/types";
import { formatAud } from "@/lib/crm/types";
import type { AgentComposeResult, AgentProductPick } from "@/lib/crm/agent/types";
import type {
  CampaignVerification,
  CrmChatActivity,
  CrmChatEvent,
  CrmChatMessage,
  CrmEmailTemplateRecord,
  CrmNamedAudience,
} from "@/lib/crm/agent/chat-types";
import type { ComposerSeed } from "./campaign-composer";

const PREVIEW_UNSUBSCRIBE_PLACEHOLDER = "https://yellowjersey.store/unsubscribe?token=preview";
const SPECS_COLLAPSED_KEY = "crm-agent-specs-collapsed";

type TranscriptItem =
  | { id: string; kind: "user"; content: string }
  | { id: string; kind: "assistant"; content: string }
  | { id: string; kind: "activities"; activities: CrmChatActivity[] };

type SendPlan = {
  mode: "draft" | "send_now" | "schedule";
  scheduledAt: string;
  scheduleType: "once" | "weekly" | "monthly";
  autoSend: boolean;
  scheduleName: string;
};

const STARTER_IDEAS = [
  {
    title: "Win back lapsed customers",
    prompt: "Who hasn't shopped with us in 6+ months? Build a win-back campaign for the most valuable ones.",
  },
  {
    title: "Promote what's on sale",
    prompt: "Find our best products currently on sale and build a campaign to customers who'd want them.",
  },
  {
    title: "What should I send this week?",
    prompt: "Look at my sales data and customer base and pitch me campaign ideas with real numbers.",
  },
];

export function CrmAgentPanel(props: {
  store: StoreBranding;
  onOpenComposer: (seed: ComposerSeed, contactIds: string[]) => void;
  onCampaignCreated: () => void;
}) {
  const { store, onOpenComposer, onCampaignCreated } = props;

  // Conversation
  const [prompt, setPrompt] = React.useState("");
  const [transcript, setTranscript] = React.useState<TranscriptItem[]>([]);
  const [running, setRunning] = React.useState(false);
  const [liveStatus, setLiveStatus] = React.useState<string | null>(null);
  const [streamingText, setStreamingText] = React.useState("");
  const [suggestions, setSuggestions] = React.useState<string[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);

  // Verified campaign state (only ever set from agent tool events)
  const [audience, setAudience] = React.useState<CrmNamedAudience | null>(null);
  const [products, setProducts] = React.useState<AgentProductPick[]>([]);
  const [campaign, setCampaign] = React.useState<AgentComposeResult | null>(null);
  const [verification, setVerification] = React.useState<CampaignVerification | null>(null);
  const [selectedSubject, setSelectedSubject] = React.useState(0);
  const appliedTemplateRef = React.useRef<string | null>(null);

  // Templates
  const [templates, setTemplates] = React.useState<CrmEmailTemplateRecord[]>([]);
  const [templatesOpen, setTemplatesOpen] = React.useState(false);
  const [savingTemplate, setSavingTemplate] = React.useState(false);
  const [templateNameDraft, setTemplateNameDraft] = React.useState("");
  const [showSaveTemplate, setShowSaveTemplate] = React.useState(false);

  // Preview + send
  const [previewMode, setPreviewMode] = React.useState<"desktop" | "mobile">("desktop");
  const [specsCollapsed, setSpecsCollapsed] = React.useState(false);
  const [creating, setCreating] = React.useState(false);
  const [sendPlan, setSendPlan] = React.useState<SendPlan>({
    mode: "draft",
    scheduledAt: "",
    scheduleType: "once",
    autoSend: false,
    scheduleName: "",
  });

  const abortRef = React.useRef<AbortController | null>(null);
  const chatScrollRef = React.useRef<HTMLDivElement>(null);
  const templatesRef = React.useRef<HTMLDivElement>(null);

  const hasStarted = transcript.length > 0;

  const loadTemplates = React.useCallback(async () => {
    try {
      const res = await fetch("/api/store/crm/templates", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      setTemplates(data.templates ?? []);
    } catch {
      // non-fatal
    }
  }, []);

  React.useEffect(() => {
    void loadTemplates();
  }, [loadTemplates]);

  React.useEffect(() => {
    try {
      setSpecsCollapsed(window.localStorage.getItem(SPECS_COLLAPSED_KEY) === "1");
    } catch {
      // ignore
    }
  }, []);

  const toggleSpecsCollapsed = React.useCallback(() => {
    setSpecsCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(SPECS_COLLAPSED_KEY, next ? "1" : "0");
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  React.useEffect(() => {
    if (!templatesOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (templatesRef.current?.contains(event.target as Node)) return;
      setTemplatesOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [templatesOpen]);

  React.useEffect(() => {
    chatScrollRef.current?.scrollTo({ top: chatScrollRef.current.scrollHeight, behavior: "smooth" });
  }, [transcript, streamingText, liveStatus, suggestions, running]);

  const upsertActivity = React.useCallback((activity: CrmChatActivity) => {
    setTranscript((prev) => {
      const next = [...prev];
      const last = next[next.length - 1];
      if (last?.kind === "activities") {
        const activities = [...last.activities];
        const index = activities.findIndex((a) => a.id === activity.id);
        if (index >= 0) activities[index] = activity;
        else activities.push(activity);
        next[next.length - 1] = { ...last, activities };
        return next;
      }
      next.push({ id: crypto.randomUUID(), kind: "activities", activities: [activity] });
      return next;
    });
  }, []);

  const handleEvent = React.useCallback(
    (event: CrmChatEvent) => {
      switch (event.type) {
        case "status":
          setLiveStatus(event.text);
          break;
        case "activity":
          upsertActivity(event.activity);
          break;
        case "assistant_delta":
          setStreamingText((prev) => prev + event.text);
          break;
        case "assistant_message":
          setStreamingText("");
          setLiveStatus(null);
          setTranscript((prev) => [
            ...prev,
            { id: crypto.randomUUID(), kind: "assistant", content: event.text },
          ]);
          break;
        case "audience":
          setAudience(event.audience);
          break;
        case "products":
          setProducts(event.products);
          break;
        case "campaign":
          setCampaign(event.campaign);
          setVerification(event.verification ?? null);
          setSelectedSubject(0);
          setSendPlan((plan) =>
            plan.scheduleName.trim()
              ? plan
              : { ...plan, scheduleName: event.campaign.subject.slice(0, 60) },
          );
          break;
        case "suggestions":
          setSuggestions(event.suggestions.slice(0, 3));
          break;
        case "template_saved":
          void loadTemplates();
          break;
        case "error":
          setError(event.message);
          break;
        case "done":
          break;
      }
    },
    [loadTemplates, upsertActivity],
  );

  const stopAgent = React.useCallback(() => {
    abortRef.current?.abort();
    setRunning(false);
    setLiveStatus(null);
  }, []);

  const runAgent = async (text?: string) => {
    const trimmed = (text ?? prompt).trim();
    if (!trimmed || running) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setPrompt("");
    setRunning(true);
    setError(null);
    setSuccess(null);
    setSuggestions([]);
    setStreamingText("");
    setLiveStatus("Thinking");

    const history: CrmChatMessage[] = transcript
      .filter((item): item is Extract<TranscriptItem, { kind: "user" | "assistant" }> =>
        item.kind === "user" || item.kind === "assistant",
      )
      .map((item) => ({ role: item.kind, content: item.content }));

    setTranscript((prev) => [
      ...prev,
      { id: crypto.randomUUID(), kind: "user", content: trimmed },
      { id: crypto.randomUUID(), kind: "activities", activities: [] },
    ]);

    const appliedTemplateName = appliedTemplateRef.current;
    appliedTemplateRef.current = null;

    try {
      const res = await fetch("/api/store/crm/agent/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...history, { role: "user", content: trimmed }],
          state: {
            campaign,
            audienceRules: audience?.rules ?? null,
            audienceName: audience?.name ?? null,
            audienceCount: audience?.count ?? null,
            appliedTemplateName,
          },
        }),
        signal: controller.signal,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error ?? "Agent request failed");
      }
      if (!res.body) throw new Error("No response stream");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split("\n\n");
        buffer = chunks.pop() ?? "";
        for (const chunk of chunks) {
          if (!chunk.startsWith("data: ")) continue;
          try {
            handleEvent(JSON.parse(chunk.slice(6)) as CrmChatEvent);
          } catch {
            // skip malformed frame
          }
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      setError(err instanceof Error ? err.message : "Agent failed");
    } finally {
      setRunning(false);
      setLiveStatus(null);
    }
  };

  const applyTemplate = (template: CrmEmailTemplateRecord) => {
    const applied: AgentComposeResult = {
      subject: template.subject,
      subjectVariants: [template.subject],
      templateKey: template.template_key,
      content: template.content,
      reasoning: `Loaded from saved template “${template.name}”.`,
    };
    setCampaign(applied);
    setVerification(null);
    setSelectedSubject(0);
    setTemplatesOpen(false);
    appliedTemplateRef.current = template.name;
    setTranscript((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        kind: "assistant",
        content: `Loaded your “${template.name}” template into the preview. Tell me what to change — copy, products, or who it should go to.`,
      },
    ]);
  };

  const saveTemplate = async () => {
    if (!campaign || !templateNameDraft.trim()) return;
    setSavingTemplate(true);
    setError(null);
    try {
      const res = await fetch("/api/store/crm/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: templateNameDraft.trim(),
          subject: campaign.subjectVariants[selectedSubject] ?? campaign.subject,
          templateKey: campaign.templateKey,
          content: campaign.content,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error ?? "Failed to save template");
      }
      setTemplateNameDraft("");
      setShowSaveTemplate(false);
      setSuccess("Template saved. Reuse it any time from the Templates menu.");
      await loadTemplates();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save template");
    } finally {
      setSavingTemplate(false);
    }
  };

  const createDraft = async () => {
    if (!campaign) return;
    if (!audience || audience.contactIds.length === 0) {
      setError("No verified audience yet — ask the agent who this should go to first.");
      return;
    }
    setCreating(true);
    setError(null);
    setSuccess(null);
    try {
      const subject = campaign.subjectVariants[selectedSubject] ?? campaign.subject;

      if (sendPlan.mode === "schedule") {
        if (!sendPlan.scheduledAt) throw new Error("Choose a send date and time");
        const firstUser = transcript.find((item) => item.kind === "user");
        const schedRes = await fetch("/api/store/crm/schedules", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: sendPlan.scheduleName.trim() || subject,
            prompt: firstUser?.kind === "user" ? firstUser.content : subject,
            scheduleType: sendPlan.scheduleType,
            scheduledAt: new Date(sendPlan.scheduledAt).toISOString(),
            autoSend: sendPlan.autoSend,
          }),
        });
        if (!schedRes.ok) throw new Error("Failed to schedule campaign");
        setSuccess("Campaign scheduled. Manage it under Automation.");
        return;
      }

      const res = await fetch("/api/store/crm/agent/create-campaign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject,
          templateKey: campaign.templateKey,
          content: campaign.content,
          contactIds: audience.contactIds,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Failed to create draft");

      if (sendPlan.mode === "send_now" && data.campaignId) {
        const sendRes = await fetch(`/api/store/crm/campaigns/${data.campaignId}/send`, {
          method: "POST",
        });
        const sendData = await sendRes.json().catch(() => ({}));
        if (!sendRes.ok) throw new Error(sendData?.error ?? "Failed to send");
        setSuccess(`Campaign sent to ${sendData.sent ?? data.recipientCount} recipients.`);
        onCampaignCreated();
        return;
      }

      onCampaignCreated();
      setSuccess(`Draft created for ${data.recipientCount} recipients.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save campaign");
    } finally {
      setCreating(false);
    }
  };

  const openInComposer = () => {
    if (!campaign) return;
    const subject = campaign.subjectVariants[selectedSubject] ?? campaign.subject;
    onOpenComposer(
      { templateKey: campaign.templateKey, subject, content: campaign.content },
      audience?.contactIds ?? [],
    );
  };

  return (
    <div className="flex h-full min-h-0 flex-1 overflow-hidden">
      <ChatColumn
        hasStarted={hasStarted}
        transcript={transcript}
        running={running}
        liveStatus={liveStatus}
        streamingText={streamingText}
        suggestions={suggestions}
        error={error}
        success={success}
        prompt={prompt}
        templates={templates}
        onPromptChange={setPrompt}
        onSubmit={() => void runAgent()}
        onStop={stopAgent}
        onSuggestion={(text) => void runAgent(text)}
        onApplyTemplate={applyTemplate}
        chatScrollRef={chatScrollRef}
      />

      <PreviewColumn
        store={store}
        campaign={campaign}
        running={running}
        hasStarted={hasStarted}
        selectedSubject={selectedSubject}
        previewMode={previewMode}
        onPreviewModeChange={setPreviewMode}
        templates={templates}
        templatesOpen={templatesOpen}
        templatesRef={templatesRef}
        onTemplatesOpenChange={setTemplatesOpen}
        onApplyTemplate={applyTemplate}
        showSaveTemplate={showSaveTemplate}
        onShowSaveTemplate={setShowSaveTemplate}
        templateNameDraft={templateNameDraft}
        onTemplateNameChange={setTemplateNameDraft}
        onSaveTemplate={() => void saveTemplate()}
        savingTemplate={savingTemplate}
      />

      <SpecsColumn
        collapsed={specsCollapsed}
        onToggleCollapsed={toggleSpecsCollapsed}
        audience={audience}
        products={products}
        campaign={campaign}
        verification={verification}
        running={running}
        selectedSubject={selectedSubject}
        onSelectSubject={setSelectedSubject}
        sendPlan={sendPlan}
        onSendPlanChange={setSendPlan}
        creating={creating}
        onCreateDraft={() => void createDraft()}
        onOpenComposer={openInComposer}
      />
    </div>
  );
}

// ============================================================
// Chat column
// ============================================================

const ACTIVITY_ICONS: Record<CrmChatActivity["kind"], React.ComponentType<{ className?: string }>> = {
  sql: Search,
  audience: Users,
  customers: Users,
  products: Sparkles,
  compose: Wand2,
  template: Layers,
  verify: CheckCircle2,
};

function ActivityFeed({ activities, running }: { activities: CrmChatActivity[]; running: boolean }) {
  if (activities.length === 0) return null;
  return (
    <div className="space-y-1.5 rounded-xl border border-border/50 bg-gray-50/70 px-3 py-2.5">
      {activities.map((activity) => {
        const Icon = ACTIVITY_ICONS[activity.kind] ?? Search;
        const isRunning = activity.status === "running" && running;
        return (
          <div key={activity.id} className="flex items-start gap-2 text-xs leading-snug">
            {activity.status === "error" ? (
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber-500" />
            ) : isRunning ? (
              <Icon className="mt-0.5 size-3.5 shrink-0 text-gray-400" />
            ) : (
              <Check className="mt-0.5 size-3.5 shrink-0 text-emerald-500" />
            )}
            <div className="min-w-0 flex-1">
              <span
                className={cn(
                  "font-medium",
                  isRunning ? genieProgressShimmerClassName : "text-foreground",
                )}
                style={isRunning ? genieProgressShimmerStyle : undefined}
              >
                {activity.label}
              </span>
              {activity.detail ? (
                <span className={cn("ml-1.5", activity.status === "error" ? "text-amber-600" : "text-muted-foreground")}>
                  {activity.detail}
                </span>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function AssistantMessage({ content }: { content: string }) {
  const html = React.useMemo(() => renderGenieMarkdown(content, { compact: true }), [content]);
  return (
    <div
      className="max-w-[95%] text-sm leading-relaxed text-foreground [&_p]:mb-1.5 [&_p:last-child]:mb-0"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function ChatColumn(props: {
  hasStarted: boolean;
  transcript: TranscriptItem[];
  running: boolean;
  liveStatus: string | null;
  streamingText: string;
  suggestions: string[];
  error: string | null;
  success: string | null;
  prompt: string;
  templates: CrmEmailTemplateRecord[];
  onPromptChange: (v: string) => void;
  onSubmit: () => void;
  onStop: () => void;
  onSuggestion: (text: string) => void;
  onApplyTemplate: (template: CrmEmailTemplateRecord) => void;
  chatScrollRef: React.RefObject<HTMLDivElement | null>;
}) {
  const {
    hasStarted,
    transcript,
    running,
    liveStatus,
    streamingText,
    suggestions,
    error,
    success,
    prompt,
    templates,
    onPromptChange,
    onSubmit,
    onStop,
    onSuggestion,
    onApplyTemplate,
    chatScrollRef,
  } = props;

  return (
    <aside className="flex w-[min(380px,32%)] shrink-0 flex-col border-r border-border/60 bg-white">
      <div className="shrink-0 border-b border-border/40 px-4 py-3">
        <p className="text-sm font-semibold text-foreground">AI Campaign</p>
        <p className="text-xs text-muted-foreground">
          Your marketing director — knows your customers, sales, and stock
        </p>
      </div>

      <div ref={chatScrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {!hasStarted ? (
          <EmptyState
            templates={templates}
            onSuggestion={onSuggestion}
            onApplyTemplate={onApplyTemplate}
          />
        ) : (
          <div className="space-y-3.5">
            {transcript.map((item) => {
              if (item.kind === "user") {
                return (
                  <div key={item.id} className="flex justify-end">
                    <div className="max-w-[92%] rounded-[18px] bg-primary px-3.5 py-2 text-sm leading-snug text-primary-foreground">
                      <span className="whitespace-pre-wrap">{item.content}</span>
                    </div>
                  </div>
                );
              }
              if (item.kind === "activities") {
                return <ActivityFeed key={item.id} activities={item.activities} running={running} />;
              }
              return <AssistantMessage key={item.id} content={item.content} />;
            })}

            {streamingText ? <AssistantMessage content={streamingText} /> : null}

            {running && liveStatus && !streamingText ? (
              <span
                className={cn("block text-sm leading-snug", genieProgressShimmerClassName)}
                style={genieProgressShimmerStyle}
              >
                {liveStatus}
              </span>
            ) : null}

            {!running && suggestions.length > 0 ? (
              <div className="flex flex-wrap gap-1.5 pt-0.5">
                {suggestions.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => onSuggestion(suggestion)}
                    className="rounded-full border border-border/60 bg-white px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-zinc-400 hover:bg-gray-50"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            ) : null}

            {error ? (
              <div className="flex items-start gap-1.5 rounded-md border border-red-200 bg-white px-3 py-2 text-xs text-red-700">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                {error}
              </div>
            ) : null}

            {success ? (
              <div className="flex items-center gap-1.5 rounded-md border border-emerald-200 bg-white px-3 py-2 text-xs text-emerald-800">
                <CheckCircle2 className="size-3.5 shrink-0" />
                {success}
              </div>
            ) : null}
          </div>
        )}
      </div>

      <div className="shrink-0 border-t border-border/40 p-3">
        <div className="rounded-2xl border border-border/60 bg-gray-50 shadow-sm">
          <HomeV2ChatInput
            compact
            floating
            value={prompt}
            isRunning={running}
            onChange={onPromptChange}
            onSubmit={onSubmit}
            onStop={onStop}
            placeholder={
              hasStarted
                ? "Reply, refine, or ask anything…"
                : "e.g. 20% off Muc-Off for anyone who bought it before"
            }
            showDisclaimer={false}
          />
        </div>
      </div>
    </aside>
  );
}

function EmptyState(props: {
  templates: CrmEmailTemplateRecord[];
  onSuggestion: (text: string) => void;
  onApplyTemplate: (template: CrmEmailTemplateRecord) => void;
}) {
  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Tell me what you want to achieve and I&apos;ll dig into your Lightspeed data, pick the
          right customers, and design the email — or ask me anything about your customers first.
        </p>
      </div>

      <div className="space-y-1.5">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Try one of these
        </p>
        {STARTER_IDEAS.map((idea) => (
          <button
            key={idea.title}
            type="button"
            onClick={() => props.onSuggestion(idea.prompt)}
            className="w-full rounded-xl border border-border/50 bg-white px-3.5 py-2.5 text-left transition-colors hover:border-zinc-400 hover:bg-gray-50"
          >
            <p className="text-sm font-medium text-foreground">{idea.title}</p>
            <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{idea.prompt}</p>
          </button>
        ))}
      </div>

      {props.templates.length > 0 ? (
        <div className="space-y-1.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Start from a saved template
          </p>
          {props.templates.slice(0, 4).map((template) => (
            <button
              key={template.id}
              type="button"
              onClick={() => props.onApplyTemplate(template)}
              className="flex w-full items-center gap-2.5 rounded-xl border border-border/50 bg-white px-3.5 py-2.5 text-left transition-colors hover:border-zinc-400 hover:bg-gray-50"
            >
              <Layers className="size-4 shrink-0 text-gray-400" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-foreground">{template.name}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {template.description || template.subject}
                </span>
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

// ============================================================
// Preview column — inbox chrome, viewport toggle, template library
// ============================================================

function PreviewColumn(props: {
  store: StoreBranding;
  campaign: AgentComposeResult | null;
  running: boolean;
  hasStarted: boolean;
  selectedSubject: number;
  previewMode: "desktop" | "mobile";
  onPreviewModeChange: (mode: "desktop" | "mobile") => void;
  templates: CrmEmailTemplateRecord[];
  templatesOpen: boolean;
  templatesRef: React.RefObject<HTMLDivElement | null>;
  onTemplatesOpenChange: (open: boolean) => void;
  onApplyTemplate: (template: CrmEmailTemplateRecord) => void;
  showSaveTemplate: boolean;
  onShowSaveTemplate: (show: boolean) => void;
  templateNameDraft: string;
  onTemplateNameChange: (v: string) => void;
  onSaveTemplate: () => void;
  savingTemplate: boolean;
}) {
  const {
    store,
    campaign,
    running,
    hasStarted,
    selectedSubject,
    previewMode,
    onPreviewModeChange,
    templates,
    templatesOpen,
    templatesRef,
    onTemplatesOpenChange,
    onApplyTemplate,
    showSaveTemplate,
    onShowSaveTemplate,
    templateNameDraft,
    onTemplateNameChange,
    onSaveTemplate,
    savingTemplate,
  } = props;
  const subject = campaign?.subjectVariants[selectedSubject] ?? campaign?.subject ?? "";

  return (
    <main className="flex min-w-0 flex-1 flex-col bg-gray-100/70">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border/40 bg-white px-4 py-2.5">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">Email preview</p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {subject || "Designed live as the agent works"}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <div className="flex items-center rounded-lg border border-border/60 p-0.5">
            <button
              type="button"
              onClick={() => onPreviewModeChange("desktop")}
              className={cn(
                "flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors",
                previewMode === "desktop"
                  ? "bg-zinc-900 text-white"
                  : "text-muted-foreground hover:text-foreground",
              )}
              aria-label="Desktop preview"
            >
              <Monitor className="size-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onPreviewModeChange("mobile")}
              className={cn(
                "flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors",
                previewMode === "mobile"
                  ? "bg-zinc-900 text-white"
                  : "text-muted-foreground hover:text-foreground",
              )}
              aria-label="Mobile preview"
            >
              <Smartphone className="size-3.5" />
            </button>
          </div>

          <div ref={templatesRef} className="relative">
            <button
              type="button"
              onClick={() => onTemplatesOpenChange(!templatesOpen)}
              className="inline-flex items-center gap-1 rounded-lg border border-border/60 px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-gray-50"
            >
              <Layers className="size-3.5" />
              Templates
              <ChevronDown
                className={cn("h-3 w-3 transition-transform duration-200", templatesOpen && "rotate-180")}
              />
            </button>
            <AnimatePresence>
              {templatesOpen ? (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.15 }}
                  className="absolute right-0 top-full z-20 mt-1 w-72 overflow-hidden rounded-xl border border-border/60 bg-white shadow-lg"
                >
                  {templates.length === 0 ? (
                    <p className="px-3.5 py-3 text-xs text-muted-foreground">
                      No saved templates yet. Build a design you like, then hit “Save as template”.
                    </p>
                  ) : (
                    <div className="max-h-72 overflow-y-auto py-1">
                      {templates.map((template) => (
                        <button
                          key={template.id}
                          type="button"
                          onClick={() => onApplyTemplate(template)}
                          className="w-full px-3.5 py-2.5 text-left transition-colors hover:bg-gray-50"
                        >
                          <p className="truncate text-sm font-medium text-foreground">{template.name}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {template.description || template.subject}
                            {template.use_count > 0 ? ` · used ${template.use_count}×` : ""}
                          </p>
                        </button>
                      ))}
                    </div>
                  )}
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>

          {campaign ? (
            showSaveTemplate ? (
              <div className="flex items-center gap-1.5">
                <Input
                  autoFocus
                  value={templateNameDraft}
                  onChange={(e) => onTemplateNameChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") onSaveTemplate();
                    if (e.key === "Escape") onShowSaveTemplate(false);
                  }}
                  placeholder="Template name…"
                  className="h-8 w-40 text-xs"
                />
                <Button
                  size="sm"
                  className="h-8"
                  onClick={onSaveTemplate}
                  disabled={savingTemplate || !templateNameDraft.trim()}
                >
                  {savingTemplate ? <Loader2 className="size-3.5 animate-spin" /> : "Save"}
                </Button>
                <button
                  type="button"
                  onClick={() => onShowSaveTemplate(false)}
                  className="text-muted-foreground hover:text-foreground"
                  aria-label="Cancel save template"
                >
                  <X className="size-4" />
                </button>
              </div>
            ) : (
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs"
                onClick={() => onShowSaveTemplate(true)}
              >
                Save as template
              </Button>
            )
          ) : null}
        </div>
      </div>

      <div className="relative min-h-0 flex-1 overflow-y-auto p-5">
        {campaign ? (
          <div
            className={cn(
              "mx-auto flex h-full flex-col transition-[max-width] duration-300",
              previewMode === "mobile" ? "max-w-[390px]" : "max-w-[680px]",
            )}
          >
            <InboxChrome store={store} subject={subject} mode={previewMode} />
            <CampaignEmailPreview
              templateKey={campaign.templateKey}
              content={campaign.content}
              store={store}
              className="min-h-[480px] flex-1"
            />
          </div>
        ) : running ? (
          <div className="flex h-full flex-col items-center justify-center gap-3">
            <div className="w-full max-w-[560px] space-y-3 rounded-2xl border border-border/50 bg-white p-6 shadow-sm">
              <div className="h-8 w-2/3 animate-pulse rounded-md bg-gray-100" />
              <div className="h-40 animate-pulse rounded-lg bg-gray-100" />
              <div className="h-4 w-full animate-pulse rounded bg-gray-100" />
              <div className="h-4 w-5/6 animate-pulse rounded bg-gray-100" />
              <div className="h-10 w-40 animate-pulse rounded-md bg-gray-100" />
            </div>
            <span className={cn("text-sm", genieProgressShimmerClassName)} style={genieProgressShimmerStyle}>
              Designing your email…
            </span>
          </div>
        ) : (
          <div className="flex h-full items-center justify-center">
            <div className="max-w-sm rounded-2xl border border-dashed border-border/70 bg-white/60 px-8 py-10 text-center">
              <Wand2 className="mx-auto size-6 text-gray-300" />
              <p className="mt-3 text-sm font-medium text-foreground">Your email renders here</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {hasStarted
                  ? "The live HTML design will appear as soon as the agent composes it."
                  : "Start the conversation on the left — real HTML, real products, real prices."}
              </p>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

/** Fake inbox header so owners see the email as their customers will. */
function InboxChrome({ store, subject, mode }: { store: StoreBranding; subject: string; mode: "desktop" | "mobile" }) {
  const initial = (store.name || "S").trim().charAt(0).toUpperCase();
  return (
    <div className="rounded-t-xl border border-b-0 border-border/60 bg-white px-4 py-3">
      <div className="flex items-center gap-3">
        {store.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={store.logoUrl}
            alt=""
            className="size-9 shrink-0 rounded-full border border-border/40 object-contain"
          />
        ) : (
          <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-sm font-bold text-white">
            {initial}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <p className="truncate text-sm font-semibold text-foreground">{store.name}</p>
            <span className="shrink-0 text-[11px] text-muted-foreground">now</span>
          </div>
          <p className={cn("truncate font-medium text-foreground", mode === "mobile" ? "text-xs" : "text-sm")}>
            {subject || "(no subject)"}
          </p>
          <p className="truncate text-xs text-muted-foreground">To: your customers</p>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Specs column — only verified numbers
// ============================================================

function SpecsColumn(props: {
  collapsed: boolean;
  onToggleCollapsed: () => void;
  audience: CrmNamedAudience | null;
  products: AgentProductPick[];
  campaign: AgentComposeResult | null;
  verification: CampaignVerification | null;
  running: boolean;
  selectedSubject: number;
  onSelectSubject: (index: number) => void;
  sendPlan: SendPlan;
  onSendPlanChange: React.Dispatch<React.SetStateAction<SendPlan>>;
  creating: boolean;
  onCreateDraft: () => void;
  onOpenComposer: () => void;
}) {
  const { audience, products, campaign, verification, collapsed, onToggleCollapsed } = props;
  const empty = !audience && !campaign;

  return (
    <aside
      className={cn(
        "flex shrink-0 flex-col overflow-hidden border-l border-border/60 bg-white transition-[width] duration-[400ms] ease-[cubic-bezier(0.04,0.62,0.23,0.98)]",
        collapsed ? "w-10" : "w-[min(330px,28%)]",
      )}
    >
      <div
        className={cn(
          "shrink-0 border-b border-border/40",
          collapsed ? "flex justify-center px-1 py-3" : "px-4 py-3",
        )}
      >
        {collapsed ? (
          <button
            type="button"
            onClick={onToggleCollapsed}
            aria-label="Expand campaign specs"
            title="Show campaign specs"
            className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-gray-100 hover:text-foreground"
          >
            <PanelRightOpen className="size-4" />
          </button>
        ) : (
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">Campaign specs</p>
              <p className="text-xs text-muted-foreground">Verified audience, products, and checks</p>
            </div>
            <button
              type="button"
              onClick={onToggleCollapsed}
              aria-label="Collapse campaign specs"
              title="Hide campaign specs"
              className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-gray-100 hover:text-foreground"
            >
              <PanelRightClose className="size-4" />
            </button>
          </div>
        )}
      </div>

      <AnimatePresence initial={false}>
        {!collapsed ? (
          <motion.div
            key="specs-content"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4, ease: [0.04, 0.62, 0.23, 0.98] }}
            className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
          >
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {empty ? (
          <p className="text-sm text-muted-foreground">
            Everything here is verified against your real data as the agent works — exact recipient
            counts, the rule-by-rule audience funnel, featured products, and email quality checks.
          </p>
        ) : (
          <div className="space-y-5">
            {audience ? (
              <SpecSection title={audience.name ? `Recipients — ${audience.name}` : "Recipients"}>
                <div className="flex items-center gap-2">
                  <Users className="size-4 text-gray-500" />
                  <span className="text-sm font-semibold">
                    {audience.count.toLocaleString()} recipient{audience.count === 1 ? "" : "s"}
                  </span>
                  <Badge variant="secondary" className="rounded-md text-[10px] uppercase tracking-wide">
                    Verified
                  </Badge>
                </div>

                {audience.funnel && audience.funnel.length > 0 ? (
                  <div className="mt-2.5 space-y-0 rounded-lg border border-border/40 bg-gray-50/60 px-3 py-2">
                    {audience.funnel.map((step, index) => (
                      <div
                        key={`${step.label}-${index}`}
                        className={cn(
                          "flex items-baseline justify-between gap-2 py-1.5",
                          index > 0 && "border-t border-border/30",
                        )}
                      >
                        <div className="min-w-0">
                          <p className="truncate text-xs font-medium text-foreground">{step.label}</p>
                          {step.detail ? (
                            <p className="truncate text-[11px] text-muted-foreground">{step.detail}</p>
                          ) : null}
                        </div>
                        <span className="shrink-0 text-xs font-semibold tabular-nums text-foreground">
                          {step.count.toLocaleString()}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : null}

                {audience.sample.length > 0 ? (
                  <div className="mt-2.5">
                    <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      Sample of actual recipients
                    </p>
                    <ul className="space-y-1.5">
                      {audience.sample.slice(0, 5).map((contact) => (
                        <li key={contact.id} className="rounded-md bg-gray-50 px-2.5 py-1.5 text-xs">
                          <p className="font-medium text-foreground">
                            {[contact.first_name, contact.last_name].filter(Boolean).join(" ") || contact.email}
                          </p>
                          <p className="text-muted-foreground">
                            {formatAud(contact.total_spend)} lifetime · {contact.sale_count} visit
                            {contact.sale_count === 1 ? "" : "s"}
                          </p>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {audience.sort ? (
                  <p className="mt-2 text-[11px] text-muted-foreground">{audience.sort.label}</p>
                ) : null}
              </SpecSection>
            ) : null}

            {products.length > 0 ? (
              <SpecSection title={`Featured products (${products.length})`}>
                <ul className="space-y-1.5">
                  {products.map((product, index) => (
                    <li
                      key={`${product.productId ?? product.title}-${index}`}
                      className="flex items-center gap-2.5 rounded-md border border-border/40 px-2.5 py-2"
                    >
                      {product.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={product.imageUrl}
                          alt=""
                          className="size-10 shrink-0 rounded-md border border-border/30 bg-white object-contain"
                        />
                      ) : (
                        <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-gray-100 text-[10px] text-muted-foreground">
                          No img
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium text-foreground">{product.title}</p>
                        <p className="truncate text-[11px] text-muted-foreground">
                          {product.price}
                          {product.originalPrice ? (
                            <span className="ml-1 line-through">{product.originalPrice}</span>
                          ) : null}
                          {product.badge ? <span className="ml-1 font-semibold text-red-600">{product.badge}</span> : null}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              </SpecSection>
            ) : null}

            {verification ? (
              <SpecSection title="Quality checks">
                <ul className="space-y-1.5">
                  {verification.checks.map((check) => (
                    <li key={check.label} className="flex items-start gap-2 text-xs">
                      {check.ok ? (
                        <Check className="mt-0.5 size-3.5 shrink-0 text-emerald-500" />
                      ) : (
                        <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber-500" />
                      )}
                      <div className="min-w-0">
                        <span className="font-medium text-foreground">{check.label}</span>
                        {check.detail ? (
                          <span className="ml-1 text-muted-foreground">{check.detail}</span>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              </SpecSection>
            ) : null}

            {campaign && campaign.subjectVariants.length > 0 ? (
              <SpecSection title="Subject line">
                <div className="flex flex-col gap-1.5">
                  {campaign.subjectVariants.map((subject, index) => (
                    <button
                      key={`${subject}-${index}`}
                      type="button"
                      onClick={() => props.onSelectSubject(index)}
                      className={cn(
                        "rounded-md border px-2.5 py-2 text-left text-xs transition-colors",
                        props.selectedSubject === index
                          ? "border-zinc-900 bg-zinc-50 font-medium"
                          : "border-border/50 hover:bg-gray-50",
                      )}
                    >
                      {subject}
                    </button>
                  ))}
                </div>
              </SpecSection>
            ) : null}

            {campaign?.reasoning ? (
              <SpecSection title="Design notes">
                <p className="whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
                  {campaign.reasoning}
                </p>
              </SpecSection>
            ) : null}

            {campaign ? (
              <SpecSection title="Send timing">
                <div className="flex flex-col gap-1.5">
                  {(
                    [
                      { id: "draft", label: "Save as draft" },
                      { id: "send_now", label: "Send immediately" },
                      { id: "schedule", label: "Schedule" },
                    ] as const
                  ).map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => props.onSendPlanChange((plan) => ({ ...plan, mode: option.id }))}
                      className={cn(
                        "rounded-md border px-2.5 py-2 text-left text-xs transition-colors",
                        props.sendPlan.mode === option.id
                          ? "border-zinc-900 bg-zinc-50 font-medium"
                          : "border-border/50 hover:bg-gray-50",
                      )}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>

                {props.sendPlan.mode === "schedule" ? (
                  <div className="mt-3 space-y-2">
                    <div>
                      <Label className="text-xs">Schedule name</Label>
                      <Input
                        value={props.sendPlan.scheduleName}
                        onChange={(e) =>
                          props.onSendPlanChange((plan) => ({ ...plan, scheduleName: e.target.value }))
                        }
                        className="mt-1 h-8 text-xs"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Send at</Label>
                      <Input
                        type="datetime-local"
                        value={props.sendPlan.scheduledAt}
                        onChange={(e) =>
                          props.onSendPlanChange((plan) => ({ ...plan, scheduledAt: e.target.value }))
                        }
                        className="mt-1 h-8 text-xs"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Repeat</Label>
                      <select
                        value={props.sendPlan.scheduleType}
                        onChange={(e) =>
                          props.onSendPlanChange((plan) => ({
                            ...plan,
                            scheduleType: e.target.value as SendPlan["scheduleType"],
                          }))
                        }
                        className="mt-1 h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
                      >
                        <option value="once">Once</option>
                        <option value="weekly">Weekly</option>
                        <option value="monthly">Monthly</option>
                      </select>
                    </div>
                    <label className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Checkbox
                        checked={props.sendPlan.autoSend}
                        onCheckedChange={(checked) =>
                          props.onSendPlanChange((plan) => ({ ...plan, autoSend: checked === true }))
                        }
                      />
                      Auto-send without manual approval
                    </label>
                  </div>
                ) : null}
              </SpecSection>
            ) : null}

            {campaign ? (
              <div className="space-y-2 border-t border-border/40 pt-4">
                <Button
                  size="sm"
                  className="w-full"
                  onClick={props.onCreateDraft}
                  disabled={props.creating || props.running}
                >
                  {props.creating ? (
                    <Loader2 className="mr-1.5 size-4 animate-spin" />
                  ) : (
                    <Send className="mr-1.5 size-4" />
                  )}
                  {props.sendPlan.mode === "send_now"
                    ? `Send to ${audience ? audience.count.toLocaleString() : "…"} recipient${audience?.count === 1 ? "" : "s"}`
                    : props.sendPlan.mode === "schedule"
                      ? "Schedule campaign"
                      : "Create draft"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full"
                  onClick={props.onOpenComposer}
                  disabled={props.running}
                >
                  Edit in composer
                </Button>
              </div>
            ) : null}
          </div>
        )}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </aside>
  );
}

function SpecSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h4>
      {children}
    </section>
  );
}

// ============================================================
// Email HTML preview iframe
// ============================================================

function CampaignEmailPreview({
  templateKey,
  content,
  store,
  className,
}: {
  templateKey: string;
  content: CampaignContent;
  store: StoreBranding;
  className?: string;
}) {
  const deferredContent = React.useDeferredValue(content);
  const previewHtml = React.useMemo(
    () =>
      renderCampaignEmail({
        templateKey,
        content: deferredContent,
        store,
        unsubscribeUrl: PREVIEW_UNSUBSCRIBE_PLACEHOLDER,
      }).html,
    [templateKey, deferredContent, store],
  );

  return (
    <div
      className={cn(
        "overflow-hidden rounded-b-xl border border-border/60 bg-white shadow-sm",
        className,
      )}
    >
      <iframe
        title="Campaign email preview"
        sandbox="allow-same-origin"
        srcDoc={previewHtml}
        className="h-full min-h-[480px] w-full bg-white"
      />
    </div>
  );
}
