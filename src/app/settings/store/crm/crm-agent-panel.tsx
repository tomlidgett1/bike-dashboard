"use client";

// CRM 2.0 — three-column AI campaign editor (chat · preview · specs).

import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  CheckCircle2,
  ChevronDown,
  Loader2,
  Send,
  Users,
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
import type {
  AudienceRule,
  CrmAgentProgressEvent,
  CrmAgentRunResult,
  CrmAudiencePreset,
} from "@/lib/crm/agent/types";
import { renderCampaignEmail, type StoreBranding } from "@/lib/crm/templates";
import type { CampaignContent } from "@/lib/crm/types";
import { formatAud } from "@/lib/crm/types";
import type { ComposerSeed } from "./campaign-composer";

const PREVIEW_UNSUBSCRIBE_PLACEHOLDER = "https://yellowjersey.store/unsubscribe?token=preview";

type ChatMessage = { id: string; role: "user" | "assistant"; content: string };

type SendPlan = {
  mode: "draft" | "send_now" | "schedule";
  scheduledAt: string;
  scheduleType: "once" | "weekly" | "monthly";
  autoSend: boolean;
  scheduleName: string;
};

type AgentStep = { id: string; message: string; done: boolean };

export function CrmAgentPanel(props: {
  store: StoreBranding;
  onOpenComposer: (seed: ComposerSeed, contactIds: string[]) => void;
  onCampaignCreated: () => void;
}) {
  const { store, onOpenComposer, onCampaignCreated } = props;

  const [prompt, setPrompt] = React.useState("");
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [presets, setPresets] = React.useState<CrmAudiencePreset[]>([]);
  const [presetId, setPresetId] = React.useState("");
  const [presetOpen, setPresetOpen] = React.useState(false);
  const [running, setRunning] = React.useState(false);
  const [steps, setSteps] = React.useState<AgentStep[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<CrmAgentRunResult | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);
  const [selectedSubject, setSelectedSubject] = React.useState(0);
  const [creating, setCreating] = React.useState(false);
  const [presetName, setPresetName] = React.useState("");
  const [savingPreset, setSavingPreset] = React.useState(false);
  const [sendPlan, setSendPlan] = React.useState<SendPlan>({
    mode: "draft",
    scheduledAt: "",
    scheduleType: "once",
    autoSend: false,
    scheduleName: "",
  });

  const abortRef = React.useRef<AbortController | null>(null);
  const presetRef = React.useRef<HTMLDivElement>(null);
  const chatScrollRef = React.useRef<HTMLDivElement>(null);

  const hasStarted = messages.length > 0;
  const liveStep = steps.find((step) => !step.done) ?? steps[steps.length - 1];
  const selectedPreset = presets.find((p) => p.id === presetId);

  const loadPresets = React.useCallback(async () => {
    try {
      const res = await fetch("/api/store/crm/audience-presets", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      setPresets(data.presets ?? []);
    } catch {
      // non-fatal
    }
  }, []);

  React.useEffect(() => {
    void loadPresets();
  }, [loadPresets]);

  React.useEffect(() => {
    if (!presetOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (presetRef.current?.contains(event.target as Node)) return;
      setPresetOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [presetOpen]);

  React.useEffect(() => {
    chatScrollRef.current?.scrollTo({ top: chatScrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, steps, running]);

  const handleEvent = React.useCallback((event: CrmAgentProgressEvent) => {
    const skeleton = (patch: Partial<CrmAgentRunResult>): CrmAgentRunResult => ({
      runId: patch.runId ?? "",
      brief: patch.brief ?? {
        campaign_goal: "",
        tone: "",
        audience_description: "",
        product_focus: "",
        layout_preference: "classic",
        include_products: false,
        promo: {
          kind: "none",
          discount_percent: null,
          brand: null,
          keyword: null,
          label: null,
          only_on_sale: false,
        },
      },
      audience: patch.audience ?? {
        contactIds: [],
        count: 0,
        sample: [],
        rules: [],
        excludedOptedOut: 0,
        sort: {
          label: "Most engaged matching customers first",
          fields: ["crm_contacts.sale_count DESC", "crm_contacts.total_spend DESC"],
        },
      },
      products: patch.products ?? [],
      campaign: patch.campaign ?? {
        subject: "",
        subjectVariants: [],
        templateKey: "store_announcement",
        content: { title: "", body: "" },
        reasoning: "",
      },
    });

    if (event.type === "step") {
      setSteps((prev) => {
        const done = prev.map((s) => ({ ...s, done: true }));
        return [...done, { id: event.step, message: event.message, done: false }];
      });
    }
    if (event.type === "brief") {
      setResult((prev) =>
        skeleton({
          ...prev,
          runId: prev?.runId,
          brief: event.brief,
          audience: { ...(prev?.audience ?? skeleton({}).audience), rules: event.rules },
        }),
      );
    }
    if (event.type === "audience") {
      setResult((prev) => skeleton({ ...prev, runId: prev?.runId, audience: event.audience }));
    }
    if (event.type === "products") {
      setResult((prev) => skeleton({ ...prev, runId: prev?.runId, products: event.products }));
    }
    if (event.type === "campaign") {
      setResult((prev) => skeleton({ ...prev, runId: prev?.runId, campaign: event.campaign }));
    }
    if (event.type === "complete") {
      setSteps((prev) => prev.map((s) => ({ ...s, done: true })));
      setResult(event.result);
      const summary =
        event.result.campaign.reasoning.split("\n")[0]?.trim() ||
        "Campaign updated.";
      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: "assistant", content: summary },
      ]);
      if (!sendPlan.scheduleName.trim()) {
        setSendPlan((plan) => ({
          ...plan,
          scheduleName: event.result.campaign.subject.slice(0, 60),
        }));
      }
    }
    if (event.type === "error") {
      setError(event.message);
    }
  }, [sendPlan.scheduleName]);

  const stopAgent = React.useCallback(() => {
    abortRef.current?.abort();
    setRunning(false);
    setSteps((prev) => prev.map((s) => ({ ...s, done: true })));
  }, []);

  const consumeSseStream = async (res: Response) => {
    if (!res.body) throw new Error("No response stream");
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const event = JSON.parse(line.slice(6)) as CrmAgentProgressEvent;
        handleEvent(event);
      }
    }
  };

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
    setSteps([]);
    setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "user", content: trimmed }]);

    const isRefine = Boolean(result?.runId);

    if (!isRefine) {
      setResult(null);
      setSelectedSubject(0);
    }

    try {
      const url = isRefine ? "/api/store/crm/agent/refine" : "/api/store/crm/agent";
      const body = isRefine
        ? { message: trimmed, result, conversation: messages.slice(-8) }
        : { prompt: trimmed, presetId: presetId || undefined };

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error ?? "Agent request failed");
      }
      await consumeSseStream(res);
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      setError(err instanceof Error ? err.message : "Agent failed");
    } finally {
      setRunning(false);
    }
  };

  const createDraft = async () => {
    if (!result) return;
    setCreating(true);
    setError(null);
    setSuccess(null);
    try {
      const subject =
        result.campaign.subjectVariants[selectedSubject] ?? result.campaign.subject;

      if (sendPlan.mode === "schedule") {
        if (!sendPlan.scheduledAt) throw new Error("Choose a send date and time");
        const schedRes = await fetch("/api/store/crm/schedules", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: sendPlan.scheduleName.trim() || subject,
            prompt: messages.find((m) => m.role === "user")?.content,
            scheduleType: sendPlan.scheduleType,
            scheduledAt: new Date(sendPlan.scheduledAt).toISOString(),
            autoSend: sendPlan.autoSend,
          }),
        });
        if (!schedRes.ok) throw new Error("Failed to schedule campaign");
        setSuccess("Campaign scheduled. You can manage it under Automation.");
        return;
      }

      const res = await fetch("/api/store/crm/agent/create-campaign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject,
          templateKey: result.campaign.templateKey,
          content: result.campaign.content,
          contactIds: result.audience.contactIds,
          agentRunId: result.runId,
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
    if (!result) return;
    const subject =
      result.campaign.subjectVariants[selectedSubject] ?? result.campaign.subject;
    onOpenComposer(
      {
        templateKey: result.campaign.templateKey,
        subject,
        content: result.campaign.content,
      },
      result.audience.contactIds,
    );
  };

  const savePreset = async () => {
    if (!result || !presetName.trim()) return;
    const firstUser = messages.find((m) => m.role === "user")?.content;
    if (!firstUser) return;
    setSavingPreset(true);
    try {
      const res = await fetch("/api/store/crm/audience-presets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: presetName.trim(),
          prompt: firstUser,
          audienceRules: result.audience.rules,
        }),
      });
      if (!res.ok) throw new Error("Failed to save preset");
      setPresetName("");
      await loadPresets();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save preset");
    } finally {
      setSavingPreset(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-1 overflow-hidden">
      <ChatColumn
        hasStarted={hasStarted}
        messages={messages}
        running={running}
        liveStep={liveStep}
        error={error}
        success={success}
        prompt={prompt}
        onPromptChange={setPrompt}
        onSubmit={() => void runAgent()}
        onStop={stopAgent}
        presets={presets}
        presetId={presetId}
        presetOpen={presetOpen}
        selectedPreset={selectedPreset}
        presetRef={presetRef}
        onPresetOpenChange={setPresetOpen}
        onPresetSelect={(id, presetPrompt) => {
          setPresetId(id);
          if (presetPrompt) setPrompt(presetPrompt);
          setPresetOpen(false);
        }}
        onPresetClear={() => {
          setPresetId("");
          setPresetOpen(false);
        }}
        chatScrollRef={chatScrollRef}
      />

      <PreviewColumn
        store={store}
        result={result}
        running={running}
        selectedSubject={selectedSubject}
        hasStarted={hasStarted}
      />

      <SpecsColumn
        result={result}
        running={running}
        selectedSubject={selectedSubject}
        onSelectSubject={setSelectedSubject}
        sendPlan={sendPlan}
        onSendPlanChange={setSendPlan}
        creating={creating}
        onCreateDraft={() => void createDraft()}
        onOpenComposer={openInComposer}
        presetName={presetName}
        onPresetNameChange={setPresetName}
        onSavePreset={() => void savePreset()}
        savingPreset={savingPreset}
      />
    </div>
  );
}

function ChatColumn(props: {
  hasStarted: boolean;
  messages: ChatMessage[];
  running: boolean;
  liveStep?: AgentStep;
  error: string | null;
  success: string | null;
  prompt: string;
  onPromptChange: (v: string) => void;
  onSubmit: () => void;
  onStop: () => void;
  presets: CrmAudiencePreset[];
  presetId: string;
  presetOpen: boolean;
  selectedPreset?: CrmAudiencePreset;
  presetRef: React.RefObject<HTMLDivElement | null>;
  onPresetOpenChange: (open: boolean) => void;
  onPresetSelect: (id: string, prompt: string | null) => void;
  onPresetClear: () => void;
  chatScrollRef: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <aside className="flex w-[min(340px,30%)] shrink-0 flex-col border-r border-border/60 bg-white">
      <div className="shrink-0 border-b border-border/40 px-4 py-3">
        <p className="text-sm font-semibold text-foreground">Conversation</p>
        <p className="text-xs text-muted-foreground">Describe and refine your campaign</p>
      </div>

      <div ref={props.chatScrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {!props.hasStarted ? (
          <p className="text-sm leading-relaxed text-muted-foreground">
            What do you want the campaign to be about, and who should we send it to?
          </p>
        ) : (
          <div className="space-y-4">
            {props.messages.map((message) => (
              <div
                key={message.id}
                className={cn("flex", message.role === "user" ? "justify-end" : "justify-start")}
              >
                <div
                  className={cn(
                    "max-w-[92%] rounded-[20px] px-3.5 py-2 text-sm leading-snug",
                    message.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-gray-100 text-foreground",
                  )}
                >
                  <span className="whitespace-pre-wrap">{message.content}</span>
                </div>
              </div>
            ))}

            {props.running && props.liveStep ? (
              <span
                className={cn("block text-sm leading-snug", genieProgressShimmerClassName)}
                style={genieProgressShimmerStyle}
              >
                {props.liveStep.message}
              </span>
            ) : null}

            {props.error ? (
              <div className="rounded-md border border-red-200 bg-white px-3 py-2 text-xs text-red-700">
                {props.error}
              </div>
            ) : null}

            {props.success ? (
              <div className="flex items-center gap-1.5 rounded-md border border-emerald-200 bg-white px-3 py-2 text-xs text-emerald-800">
                <CheckCircle2 className="size-3.5 shrink-0" />
                {props.success}
              </div>
            ) : null}
          </div>
        )}
      </div>

      <div className="shrink-0 border-t border-border/40 p-3">
        {props.presets.length > 0 ? (
          <div ref={props.presetRef} className="relative mb-2 flex justify-end">
            <button
              type="button"
              onClick={() => props.onPresetOpenChange(!props.presetOpen)}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
            >
              {props.selectedPreset ? props.selectedPreset.name : "Audience preset"}
              <ChevronDown
                className={cn(
                  "h-3 w-3 transition-transform duration-200",
                  props.presetOpen && "rotate-180",
                )}
              />
            </button>
            <AnimatePresence>
              {props.presetOpen ? (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.4, ease: [0.04, 0.62, 0.23, 0.98] }}
                  className="absolute bottom-full right-0 z-10 mb-1 w-52 overflow-hidden rounded-md border border-border/60 bg-white shadow-sm"
                >
                  <button
                    type="button"
                    className="w-full px-3 py-2 text-left text-xs hover:bg-gray-50"
                    onClick={props.onPresetClear}
                  >
                    None
                  </button>
                  {props.presets.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      className="w-full border-t border-border/40 px-3 py-2 text-left text-xs hover:bg-gray-50"
                      onClick={() => props.onPresetSelect(preset.id, preset.prompt)}
                    >
                      {preset.name}
                    </button>
                  ))}
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>
        ) : null}

        <div className="overflow-hidden rounded-full border border-border/60 bg-gray-50 shadow-sm">
          <HomeV2ChatInput
            compact
            floating
            value={props.prompt}
            isRunning={props.running}
            onChange={props.onPromptChange}
            onSubmit={props.onSubmit}
            onStop={props.onStop}
            placeholder={
              props.hasStarted
                ? "Make headline more urgent"
                : "Find gravel bike buyers"
            }
            showDisclaimer={false}
          />
        </div>
      </div>
    </aside>
  );
}

function PreviewColumn(props: {
  store: StoreBranding;
  result: CrmAgentRunResult | null;
  running: boolean;
  selectedSubject: number;
  hasStarted: boolean;
}) {
  const campaign = props.result?.campaign;
  const subject =
    campaign?.subjectVariants[props.selectedSubject] ?? campaign?.subject ?? "";

  return (
    <main className="flex min-w-0 flex-1 flex-col bg-gray-50/60">
      <div className="shrink-0 border-b border-border/40 bg-white px-4 py-3">
        <p className="text-sm font-semibold text-foreground">Email design</p>
        {subject ? (
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{subject}</p>
        ) : (
          <p className="mt-0.5 text-xs text-muted-foreground">Live HTML preview</p>
        )}
      </div>

      <div className="relative min-h-0 flex-1 p-4">
        {campaign ? (
          <CampaignEmailPreview
            templateKey={campaign.templateKey}
            content={campaign.content}
            store={props.store}
            className="h-full"
          />
        ) : props.running ? (
          <div className="flex h-full items-center justify-center">
            <span
              className={cn("text-sm", genieProgressShimmerClassName)}
              style={genieProgressShimmerStyle}
            >
              Building your email…
            </span>
          </div>
        ) : (
          <div className="flex h-full items-center justify-center rounded-md border border-dashed border-border/60 bg-white px-6 text-center">
            <p className="max-w-sm text-sm text-muted-foreground">
              {props.hasStarted
                ? "Your email preview will appear here once the agent finishes composing."
                : "Start a conversation on the left — your campaign email will render here in real HTML."}
            </p>
          </div>
        )}
      </div>
    </main>
  );
}

function SpecsColumn(props: {
  result: CrmAgentRunResult | null;
  running: boolean;
  selectedSubject: number;
  onSelectSubject: (index: number) => void;
  sendPlan: SendPlan;
  onSendPlanChange: React.Dispatch<React.SetStateAction<SendPlan>>;
  creating: boolean;
  onCreateDraft: () => void;
  onOpenComposer: () => void;
  presetName: string;
  onPresetNameChange: (v: string) => void;
  onSavePreset: () => void;
  savingPreset: boolean;
}) {
  const { result } = props;

  return (
    <aside className="flex w-[min(320px,28%)] shrink-0 flex-col border-l border-border/60 bg-white">
      <div className="shrink-0 border-b border-border/40 px-4 py-3">
        <p className="text-sm font-semibold text-foreground">Campaign specs</p>
        <p className="text-xs text-muted-foreground">Audience, timing, and logic</p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {!result ? (
          <p className="text-sm text-muted-foreground">
            Audience rules, recipient count, send timing, and agent reasoning will appear here after
            your first prompt.
          </p>
        ) : (
          <div className="space-y-5">
            <SpecSection title="Recipients">
              <div className="flex items-center gap-2">
                <Users className="size-4 text-gray-500" />
                <span className="text-sm font-semibold">
                  {result.audience.count.toLocaleString()} contacts
                </span>
              </div>
              {result.audience.excludedOptedOut > 0 ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  {result.audience.excludedOptedOut.toLocaleString()} opted out — excluded
                  automatically
                </p>
              ) : null}
              {result.audience.sample.length > 0 ? (
                <ul className="mt-2 space-y-1.5">
                  {result.audience.sample.slice(0, 5).map((contact) => (
                    <li
                      key={contact.id}
                      className="rounded-md bg-gray-50 px-2.5 py-1.5 text-xs"
                    >
                      <p className="font-medium text-foreground">
                        {[contact.first_name, contact.last_name].filter(Boolean).join(" ") ||
                          contact.email}
                      </p>
                      <p className="text-muted-foreground">
                        {formatAud(contact.total_spend)} · {contact.sale_count} visits
                      </p>
                    </li>
                  ))}
                </ul>
              ) : null}
            </SpecSection>

            <SpecSection title="Audience logic">
              <p className="text-sm text-muted-foreground">{result.brief.audience_description}</p>
              <div className="mt-3 rounded-md border border-border/40 bg-gray-50 px-2.5 py-2 text-xs">
                <p className="font-medium text-foreground">Base eligibility</p>
                <p className="mt-1 text-muted-foreground">
                  `crm_contacts.user_id` = current store user and `crm_contacts.opted_out` = false.
                </p>
              </div>
              <ul className="mt-2 space-y-2">
                {result.audience.rules.map((rule, index) => (
                  <li
                    key={`${rule.type}-${index}`}
                    className="rounded-md border border-border/40 px-2.5 py-2 text-xs"
                  >
                    <span className="font-medium text-foreground">{describeAudienceRule(rule)}</span>
                    {rule.value != null && rule.value !== "" ? (
                      <span className="text-muted-foreground"> · {String(rule.value)}</span>
                    ) : null}
                    <div className="mt-1.5 space-y-1 text-[11px] leading-relaxed text-muted-foreground">
                      {audienceRuleDetails(rule).map((detail) => (
                        <p key={detail}>{detail}</p>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
              {result.audience.sort ? (
                <div className="mt-2 rounded-md border border-border/40 bg-gray-50 px-2.5 py-2 text-xs">
                  <p className="font-medium text-foreground">{result.audience.sort.label}</p>
                  <div className="mt-1 space-y-0.5 text-[11px] text-muted-foreground">
                    {result.audience.sort.fields.map((field) => (
                      <p key={field}>{field}</p>
                    ))}
                  </div>
                </div>
              ) : null}
              {result.brief.max_recipients ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  Capped at {result.brief.max_recipients.toLocaleString()} recipients
                </p>
              ) : null}
            </SpecSection>

            {result.brief.promo.kind !== "none" || result.brief.promo.brand ? (
              <SpecSection title="Promotion">
                <div className="flex flex-wrap gap-1.5">
                  {result.brief.promo.brand ? (
                    <Badge variant="secondary" className="rounded-md text-xs">
                      {result.brief.promo.brand}
                    </Badge>
                  ) : null}
                  {result.brief.promo.label ? (
                    <Badge variant="secondary" className="rounded-md text-xs">
                      {result.brief.promo.label}
                    </Badge>
                  ) : null}
                </div>
              </SpecSection>
            ) : null}

            <SpecSection title="Subject lines">
              <div className="flex flex-col gap-1.5">
                {result.campaign.subjectVariants.map((subject, index) => (
                  <button
                    key={subject}
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
                    onClick={() =>
                      props.onSendPlanChange((plan) => ({ ...plan, mode: option.id }))
                    }
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
                        props.onSendPlanChange((plan) => ({
                          ...plan,
                          scheduleName: e.target.value,
                        }))
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
                        props.onSendPlanChange((plan) => ({
                          ...plan,
                          scheduledAt: e.target.value,
                        }))
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
                        props.onSendPlanChange((plan) => ({
                          ...plan,
                          autoSend: checked === true,
                        }))
                      }
                    />
                    Auto-send without manual approval
                  </label>
                </div>
              ) : null}
            </SpecSection>

            {result.campaign.reasoning ? (
              <SpecSection title="Agent reasoning">
                <p className="whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
                  {result.campaign.reasoning}
                </p>
              </SpecSection>
            ) : null}

            <SpecSection title="Campaign goal">
              <p className="text-sm text-muted-foreground">{result.brief.campaign_goal}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Badge variant="secondary" className="rounded-md text-xs">
                  Tone: {result.brief.tone}
                </Badge>
                <Badge variant="secondary" className="rounded-md text-xs">
                  Layout: {result.brief.layout_preference}
                </Badge>
                {result.products.length > 0 ? (
                  <Badge variant="secondary" className="rounded-md text-xs">
                    {result.products.length} products
                  </Badge>
                ) : null}
              </div>
            </SpecSection>

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
                  ? "Send campaign"
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

            <div className="flex gap-2">
              <Input
                value={props.presetName}
                onChange={(e) => props.onPresetNameChange(e.target.value)}
                placeholder="Save audience preset…"
                className="h-8 text-xs"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={props.onSavePreset}
                disabled={props.savingPreset || !props.presetName.trim()}
              >
                {props.savingPreset ? <Loader2 className="size-4 animate-spin" /> : "Save"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}

function SpecSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h4>
      {children}
    </section>
  );
}

function describeAudienceRule(rule: AudienceRule): string {
  if (rule.label?.trim()) return rule.label;
  const labels: Record<AudienceRule["type"], string> = {
    min_spend: "Minimum spend",
    max_spend: "Maximum spend",
    min_visits: "Minimum visits",
    max_visits: "Maximum visits",
    joined_within_days: "Joined recently",
    joined_before_days: "Joined before",
    last_purchase_within_days: "Purchased recently",
    no_purchase_within_days: "No recent purchase",
    inactive_days: "Inactive for",
    purchased_category: "Purchased category",
    purchased_brand: "Purchased brand",
    purchased_keyword: "Purchased keyword",
    lapsed: "Lapsed customers",
    new_members: "New members",
    high_value: "High-value customers",
  };
  return labels[rule.type] ?? rule.type;
}

function audienceRuleDetails(rule: AudienceRule): string[] {
  const value = rule.value == null || rule.value === "" ? null : String(rule.value);
  switch (rule.type) {
    case "min_spend":
      return [`Uses crm_contacts.total_spend >= ${value ?? "threshold"}.`];
    case "max_spend":
      return [`Uses crm_contacts.total_spend <= ${value ?? "threshold"}.`];
    case "min_visits":
      return [`Uses crm_contacts.sale_count >= ${value ?? "visit threshold"}.`];
    case "max_visits":
      return [`Uses crm_contacts.sale_count <= ${value ?? "visit threshold"}.`];
    case "joined_within_days":
      return [
        `Uses crm_contacts.lightspeed_joined_at >= today minus ${value ?? "90"} days.`,
      ];
    case "joined_before_days":
      return [
        `Uses crm_contacts.lightspeed_joined_at < today minus ${value ?? "365"} days.`,
      ];
    case "last_purchase_within_days":
      return [
        `Uses crm_contacts.last_purchase_at >= today minus ${value ?? "365"} days.`,
        "Also constrains purchase-history rules via lightspeed_sales_report_lines.complete_time when paired with category, brand, or keyword filters.",
      ];
    case "no_purchase_within_days":
      return [
        `Uses crm_contacts.last_purchase_at empty OR < today minus ${value ?? "180"} days.`,
      ];
    case "inactive_days":
      return [
        `Uses crm_contacts.last_purchase_at empty OR < today minus ${value ?? "180"} days.`,
      ];
    case "lapsed":
      return [
        "Uses crm_contacts.last_purchase_at empty OR < today minus 180 days.",
      ];
    case "new_members":
      return [
        `Uses crm_contacts.lightspeed_joined_at >= today minus ${value ?? "90"} days.`,
      ];
    case "high_value":
      return [
        "Calculates the top 20% threshold from crm_contacts.total_spend for the already-matched audience.",
        "Then keeps contacts where crm_contacts.total_spend >= that threshold.",
      ];
    case "purchased_category":
      return [
        `Uses lightspeed_sales_report_lines.category ILIKE "%${value ?? "category"}%".`,
        "Joins back with crm_contacts.lightspeed_customer_id = lightspeed_sales_report_lines.customer_id.",
      ];
    case "purchased_brand":
      return [
        `Uses lightspeed_sales_report_lines.description ILIKE "%${value ?? "brand"}%".`,
        "Joins back with crm_contacts.lightspeed_customer_id = lightspeed_sales_report_lines.customer_id.",
      ];
    case "purchased_keyword":
      return [
        `Uses lightspeed_sales_report_lines.description, sku, or category ILIKE "%${value ?? "keyword"}%".`,
        "Joins back with crm_contacts.lightspeed_customer_id = lightspeed_sales_report_lines.customer_id.",
      ];
    default:
      return ["Uses the CRM contacts table and matching Lightspeed sales history where relevant."];
  }
}

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
        "overflow-hidden rounded-md border border-border/60 bg-white shadow-sm",
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
