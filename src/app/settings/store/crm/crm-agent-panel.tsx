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
  Lightbulb,
  Loader2,
  Monitor,
  MousePointerClick,
  PanelRightClose,
  PanelRightOpen,
  Send,
  Smartphone,
  Users,
  X,
} from "@/components/layout/app-sidebar/dashboard-icons";
import {
  DesignModeEmailPreview,
  formatDesignTargetPrompt,
  patchCampaignHtmlBody,
  VisualEditUserBubble,
  type EmailInlineEditState,
  type EmailPreviewEditorHandle,
  type EmailPreviewDesignSelection,
} from "@/app/settings/store/crm/email-preview-design";
import { EmailElementEditPanel } from "@/app/settings/store/crm/email-element-edit-panel";
import { HomeV2ChatInput } from "@/components/genie/homev2-chat-input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  AudienceMembersDialog,
  SeeAllCustomersButton,
} from "@/app/settings/store/crm/audience-members-dialog";
import { cn } from "@/lib/utils";
import {
  genieProgressShimmerClassName,
  genieProgressShimmerStyle,
} from "@/lib/genie/shimmer";
import { renderGenieMarkdown } from "@/lib/genie/render-markdown";
import { applyMergeTags } from "@/lib/crm/merge-tags";
import { buildPremadeTemplates, isPremadeTemplateId } from "@/lib/crm/premade-templates";
import { type StoreBranding } from "@/lib/crm/templates";
import { formatAud } from "@/lib/crm/types";
import type { CampaignContent } from "@/lib/crm/types";
import type { AgentComposeResult, AgentProductPick } from "@/lib/crm/agent/types";
import type {
  CampaignVerification,
  CrmChatActivity,
  CrmChatEvent,
  CrmChatMessage,
  CrmEmailImageAttachment,
  CrmEmailTemplateRecord,
  CrmNamedAudience,
} from "@/lib/crm/agent/chat-types";
import type { ComposerSeed } from "./campaign-composer";
import {
  melbourneLocalDateTimeToIso,
  MELBOURNE_TIME_ZONE,
} from "@/lib/blog/melbourne-time";

const SPECS_COLLAPSED_KEY = "crm-agent-specs-collapsed";

type TranscriptItem =
  | {
      id: string;
      kind: "user";
      content: string;
      designSelections?: EmailPreviewDesignSelection[];
      uploadedImages?: CrmEmailImageAttachment[];
    }
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

export type CampaignTemplateSeed = {
  id: string;
  subject: string;
  templateKey: string;
  content: CampaignContent;
  label: string;
};

export function CrmAgentPanel(props: {
  store: StoreBranding;
  onOpenComposer: (seed: ComposerSeed, contactIds: string[]) => void;
  onCampaignCreated: () => void;
  templateSeed?: CampaignTemplateSeed | null;
  onTemplateSeedConsumed?: () => void;
}) {
  const { store, onOpenComposer, onCampaignCreated, templateSeed, onTemplateSeedConsumed } = props;

  // Conversation
  const [prompt, setPrompt] = React.useState("");
  const [transcript, setTranscript] = React.useState<TranscriptItem[]>([]);
  const [running, setRunning] = React.useState(false);
  const [liveStatus, setLiveStatus] = React.useState<string | null>(null);
  const [streamingText, setStreamingText] = React.useState("");
  const [suggestions, setSuggestions] = React.useState<string[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);
  const [uploadedImages, setUploadedImages] = React.useState<CrmEmailImageAttachment[]>([]);
  const [uploadingImage, setUploadingImage] = React.useState(false);

  // Verified campaign state (only ever set from agent tool events)
  const [audience, setAudience] = React.useState<CrmNamedAudience | null>(null);
  const [excludedContactIds, setExcludedContactIds] = React.useState<Set<string>>(() => new Set());
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
  const [previewDesignMode, setPreviewDesignMode] = React.useState(false);
  const [inlineEdit, setInlineEdit] = React.useState<EmailInlineEditState | null>(null);
  const previewEditorRef = React.useRef<EmailPreviewEditorHandle>(null);
  const [specsCollapsed, setSpecsCollapsed] = React.useState(false);
  const [creating, setCreating] = React.useState(false);
  const [testEmail, setTestEmail] = React.useState("");
  const [sendingTest, setSendingTest] = React.useState(false);
  const [testResult, setTestResult] = React.useState<{ kind: "success" | "error"; text: string } | null>(null);
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

  const premadeTemplates = React.useMemo(() => buildPremadeTemplates(store), [store]);

  const hasStarted = transcript.length > 0;
  const showStudio = hasStarted || running;

  const effectiveContactIds = React.useMemo(
    () => audience?.contactIds.filter((id) => !excludedContactIds.has(id)) ?? [],
    [audience, excludedContactIds],
  );

  const toggleAudienceContact = React.useCallback((contactId: string, included: boolean) => {
    setExcludedContactIds((prev) => {
      const next = new Set(prev);
      if (included) next.delete(contactId);
      else next.add(contactId);
      return next;
    });
  }, []);

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
          setExcludedContactIds(new Set());
          break;
        case "products":
          setProducts(event.products);
          break;
        case "campaign":
          setCampaign(event.campaign);
          setVerification(event.verification ?? null);
          setSelectedSubject(0);
          setPreviewDesignMode(false);
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

  const uploadEmailImage = React.useCallback(async (file: File) => {
    if (!file.type.startsWith("image/")) {
      setError("Please attach an image file.");
      return;
    }

    setUploadingImage(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/store/crm/agent/upload-image", {
        method: "POST",
        body: formData,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Image upload failed");
      if (!data?.image?.url) throw new Error("Image upload did not return a URL");
      setUploadedImages((prev) => [...prev, data.image as CrmEmailImageAttachment]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Image upload failed");
    } finally {
      setUploadingImage(false);
    }
  }, []);

  const runAgent = async (
    text?: string,
    options?: {
      designSelections?: EmailPreviewDesignSelection[];
      uploadedImages?: CrmEmailImageAttachment[];
    },
  ) => {
    const imagesForTurn = options?.uploadedImages ?? uploadedImages;
    const displayText =
      (text ?? prompt).trim() ||
      (imagesForTurn.length > 0 ? "Use the attached image in this email." : "");
    if (!displayText || running) return;

    const designSelections = options?.designSelections ?? [];
    const agentText =
      designSelections.length > 0
        ? formatDesignTargetPrompt(designSelections, displayText)
        : displayText;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setPrompt("");
    setUploadedImages([]);
    setPreviewDesignMode(false);
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
      .map((item) => ({
        role: item.kind,
        content:
          item.kind === "user" && item.designSelections?.length
            ? formatDesignTargetPrompt(item.designSelections, item.content)
            : item.kind === "user" && item.uploadedImages?.length
              ? `${item.content}\n\n[Uploaded image assets]\n${item.uploadedImages
                  .map((image, index) => `${index + 1}. ${image.name}: ${image.url}`)
                  .join("\n")}`
            : item.content,
      }));

    setTranscript((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        kind: "user",
        content: displayText,
        designSelections: designSelections.length > 0 ? designSelections : undefined,
        uploadedImages: imagesForTurn.length > 0 ? imagesForTurn : undefined,
      },
      { id: crypto.randomUUID(), kind: "activities", activities: [] },
    ]);

    const appliedTemplateName = appliedTemplateRef.current;
    appliedTemplateRef.current = null;

    try {
      const res = await fetch("/api/store/crm/agent/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...history, { role: "user", content: agentText }],
          state: {
            campaign,
            audienceRules: audience?.rules ?? null,
            audienceName: audience?.name ?? null,
            audienceCount: audience?.count ?? null,
            uploadedImages: imagesForTurn,
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

  const loadCampaignDesign = React.useCallback(
    (opts: {
      subject: string;
      templateKey: string;
      content: CampaignContent;
      label: string;
      source: "template" | "campaign";
      isPremade?: boolean;
    }) => {
      const applied: AgentComposeResult = {
        subject: opts.subject,
        subjectVariants: [opts.subject],
        templateKey: opts.templateKey,
        content: opts.content,
        reasoning:
          opts.source === "campaign"
            ? `Loaded from sent campaign “${opts.label}”.`
            : `Loaded from saved template “${opts.label}”.`,
      };
      setCampaign(applied);
      setVerification(null);
      setSelectedSubject(0);
      setPreviewDesignMode(false);
      setTemplatesOpen(false);
      appliedTemplateRef.current = opts.label;
      setTranscript((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          kind: "assistant",
          content:
            opts.source === "campaign"
              ? `Loaded "${opts.label}" into the preview. Tell me what to change: copy, products, or who it should go to.`
              : opts.isPremade
                ? `Loaded the “${opts.label}” template into the preview. Tell me your offer, dates, and audience and I'll make it yours.`
                : `Loaded your “${opts.label}” template into the preview. Tell me what to change: copy, products, or who it should go to.`,
        },
      ]);
    },
    [],
  );

  const applyTemplate = (template: CrmEmailTemplateRecord) => {
    loadCampaignDesign({
      subject: template.subject,
      templateKey: template.template_key,
      content: template.content,
      label: template.name,
      source: "template",
      isPremade: isPremadeTemplateId(template.id),
    });
  };

  React.useEffect(() => {
    if (!templateSeed) return;
    loadCampaignDesign({
      subject: templateSeed.subject,
      templateKey: templateSeed.templateKey,
      content: templateSeed.content,
      label: templateSeed.label,
      source: "campaign",
    });
    onTemplateSeedConsumed?.();
  }, [templateSeed, loadCampaignDesign, onTemplateSeedConsumed]);

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
    if (!audience || effectiveContactIds.length === 0) {
      setError("No verified audience yet. Ask the agent who this should go to first.");
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
            scheduledAt: melbourneLocalDateTimeToIso(sendPlan.scheduledAt),
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
          contactIds: effectiveContactIds,
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
      effectiveContactIds,
    );
  };

  const sendTest = async () => {
    if (!campaign || !testEmail.trim() || sendingTest) return;
    setSendingTest(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/store/crm/campaigns/test-send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: testEmail.trim(),
          subject: campaign.subjectVariants[selectedSubject] ?? campaign.subject,
          templateKey: campaign.templateKey,
          content: campaign.content,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Test send failed");
      setTestResult({ kind: "success", text: `Test sent to ${data.to ?? testEmail.trim()}` });
    } catch (err) {
      setTestResult({
        kind: "error",
        text: err instanceof Error ? err.message : "Test send failed",
      });
    } finally {
      setSendingTest(false);
    }
  };

  const runVisualEdit = (selections: EmailPreviewDesignSelection[], text: string) => {
    void runAgent(text, { designSelections: selections });
  };

  const handleDirectHtmlEdit = React.useCallback(
    (bodyHtml: string) => {
      setCampaign((prev) => {
        if (!prev) return prev;
        const nextContent = patchCampaignHtmlBody({
          content: prev.content,
          bodyHtml,
          previewFirstName: audience?.sample[0]?.first_name ?? null,
        });
        if (!nextContent) return prev;
        return { ...prev, content: nextContent };
      });
    },
    [audience],
  );

  return (
    <AnimatePresence mode="wait">
      {!showStudio ? (
        <motion.div
          key="create-landing"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
          className="flex h-full min-h-0 flex-1 overflow-hidden"
        >
          <CreateLandingView
            prompt={prompt}
            running={running}
            templates={templates}
            uploadedImages={uploadedImages}
            uploadingImage={uploadingImage}
            error={error}
            onPromptChange={setPrompt}
            onSubmit={() => void runAgent()}
            onStop={stopAgent}
            onSuggestion={(text) => void runAgent(text)}
            onApplyTemplate={applyTemplate}
            onImageSelected={(file) => void uploadEmailImage(file)}
            onRemoveUploadedImage={(id) =>
              setUploadedImages((prev) => prev.filter((image) => image.id !== id))
            }
          />
        </motion.div>
      ) : (
        <motion.div
          key="create-studio"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
          className="flex h-full min-h-0 flex-1 overflow-hidden"
        >
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
        onPromptChange={setPrompt}
        onSubmit={() => void runAgent()}
        onStop={stopAgent}
        onSuggestion={(text) => void runAgent(text)}
        chatScrollRef={chatScrollRef}
        uploadedImages={uploadedImages}
        uploadingImage={uploadingImage}
        onImageSelected={(file) => void uploadEmailImage(file)}
        onRemoveUploadedImage={(id) =>
          setUploadedImages((prev) => prev.filter((image) => image.id !== id))
        }
      />

      <PreviewColumn
        store={store}
        campaign={campaign}
        running={running}
        hasStarted={hasStarted}
        selectedSubject={selectedSubject}
        previewMode={previewMode}
        onPreviewModeChange={setPreviewMode}
        previewDesignMode={previewDesignMode}
        onPreviewDesignModeChange={setPreviewDesignMode}
        onSubmitVisualEdit={runVisualEdit}
        onDirectHtmlEdit={handleDirectHtmlEdit}
        templates={templates}
        premadeTemplates={premadeTemplates}
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
        previewFirstName={audience?.sample[0]?.first_name ?? null}
        previewEditorRef={previewEditorRef}
        onInlineEditStart={setInlineEdit}
        onInlineEditEnd={() => setInlineEdit(null)}
        specsCollapsed={specsCollapsed}
        onToggleSpecsCollapsed={toggleSpecsCollapsed}
        showSpecsPanelToggle={!inlineEdit}
      />

      {inlineEdit ? (
        <EmailElementEditPanel
          state={inlineEdit}
          onChangeStyles={(styles) => {
            previewEditorRef.current?.applyStyles(styles);
            setInlineEdit((prev) => (prev ? { ...prev, ...styles } : null));
          }}
          onDone={() => previewEditorRef.current?.finishEdit()}
          onCancel={() => previewEditorRef.current?.cancelEdit()}
          onDelete={() => previewEditorRef.current?.deleteElement()}
        />
      ) : !specsCollapsed ? (
        <SpecsColumn
        audience={audience}
        selectedCount={effectiveContactIds.length}
        excludedContactIds={excludedContactIds}
        onToggleContact={toggleAudienceContact}
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
        testEmail={testEmail}
        onTestEmailChange={setTestEmail}
        onSendTest={() => void sendTest()}
        sendingTest={sendingTest}
        testResult={testResult}
        />
      ) : null}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ============================================================
// Create landing — centred chat before the studio opens
// ============================================================

function CreateLandingView(props: {
  prompt: string;
  running: boolean;
  templates: CrmEmailTemplateRecord[];
  uploadedImages: CrmEmailImageAttachment[];
  uploadingImage: boolean;
  error: string | null;
  onPromptChange: (value: string) => void;
  onSubmit: () => void;
  onStop: () => void;
  onSuggestion: (text: string) => void;
  onApplyTemplate: (template: CrmEmailTemplateRecord) => void;
  onImageSelected: (file: File) => void;
  onRemoveUploadedImage: (id: string) => void;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto bg-[#f8fafc] px-4 py-10 sm:px-6">
      <div className="flex w-full max-w-2xl flex-col items-center gap-6">
        <div className="space-y-1.5 text-center">
          <h2 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
            What would you like to send?
          </h2>
          <p className="text-sm text-muted-foreground">
            Describe your campaign, audience, or offer. Genie will build the email for you.
          </p>
        </div>

        <div className="w-full">
          <HomeV2ChatInput
            compact
            value={props.prompt}
            isRunning={props.running}
            onChange={props.onPromptChange}
            onSubmit={props.onSubmit}
            onStop={props.onStop}
            placeholder="Describe your campaign"
            showDisclaimer={false}
            onFileSelected={props.onImageSelected}
            fileAccept="image/jpeg,image/png,image/webp,image/avif"
            fileButtonLabel="Attach image for this email"
            canSubmitWithoutText={props.uploadedImages.length > 0}
            inputAccessory={
              props.uploadedImages.length > 0 || props.uploadingImage ? (
                <ImageAttachmentAccessory
                  images={props.uploadedImages}
                  uploading={props.uploadingImage}
                  onRemove={props.onRemoveUploadedImage}
                />
              ) : undefined
            }
          />
        </div>

        <div className="flex w-full flex-wrap items-center justify-center gap-2">
          <EmptyStateDropdown label="Try one of these" icon={Lightbulb}>
            {STARTER_IDEAS.map((idea) => (
              <button
                key={idea.title}
                type="button"
                onClick={() => props.onSuggestion(idea.prompt)}
                className="w-full rounded-md px-2 py-1.5 text-left transition-colors hover:bg-gray-100"
              >
                <p className="text-xs font-medium text-foreground">{idea.title}</p>
                <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-muted-foreground">
                  {idea.prompt}
                </p>
              </button>
            ))}
          </EmptyStateDropdown>

          {props.templates.length > 0 ? (
            <EmptyStateDropdown label="Start from a saved template" icon={Layers}>
              {props.templates.slice(0, 6).map((template) => (
                <button
                  key={template.id}
                  type="button"
                  onClick={() => props.onApplyTemplate(template)}
                  className="w-full rounded-md px-2 py-1.5 text-left transition-colors hover:bg-gray-100"
                >
                  <span className="block truncate text-xs font-medium text-foreground">
                    {template.name}
                  </span>
                  <span className="block truncate text-[11px] text-muted-foreground">
                    {template.description || template.subject}
                  </span>
                </button>
              ))}
            </EmptyStateDropdown>
          ) : null}
        </div>

        {props.error ? (
          <div className="flex w-full max-w-xl items-start gap-1.5 rounded-md border border-red-200 bg-white px-3 py-2 text-xs text-red-700">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
            {props.error}
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ============================================================
// Chat column
// ============================================================

function ActivityRow({
  activity,
  running,
}: {
  activity: CrmChatActivity;
  running: boolean;
}) {
  const isRunning = activity.status === "running" && running;
  const isError = activity.status === "error";

  return (
    <div className="flex items-start gap-2.5">
      <div
        className={cn(
          "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md",
          isError ? "bg-amber-50" : "bg-gray-100",
        )}
      >
        {isError ? (
          <AlertTriangle className="size-3 shrink-0 text-amber-600" />
        ) : isRunning ? (
          <Loader2 className="size-3 shrink-0 animate-spin text-gray-500" />
        ) : (
          <Check className="size-3 shrink-0 text-gray-600" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "text-xs font-medium leading-snug text-foreground",
            isRunning && genieProgressShimmerClassName,
          )}
          style={isRunning ? genieProgressShimmerStyle : undefined}
        >
          {activity.label}
        </p>
        {activity.detail ? (
          <p
            className={cn(
              "mt-0.5 text-[11px] leading-snug",
              isError ? "text-amber-600" : "text-muted-foreground",
            )}
          >
            {activity.detail}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function ActivityFeed({ activities, running }: { activities: CrmChatActivity[]; running: boolean }) {
  const [expanded, setExpanded] = React.useState(false);

  if (activities.length === 0) return null;

  const latest = activities[activities.length - 1]!;
  const earlier = activities.slice(0, -1);
  const hasMore = earlier.length > 0;

  return (
    <div
      className={cn(
        "relative rounded-md border border-border/40 bg-white px-3 py-2.5",
        hasMore && "pr-9",
      )}
    >
      {hasMore ? (
        <button
          type="button"
          onClick={() => setExpanded((open) => !open)}
          aria-label={expanded ? "Hide earlier steps" : `Show all ${activities.length} steps`}
          aria-expanded={expanded}
          className="absolute right-2 top-1/2 flex h-6 -translate-y-1/2 items-center gap-0.5 rounded-md px-1.5 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-gray-50 hover:text-foreground"
        >
          {activities.length}
          <ChevronDown
            className={cn(
              "h-3 w-3 text-gray-400 transition-transform duration-200",
              expanded && "rotate-180",
            )}
          />
        </button>
      ) : null}

      <div className="space-y-2">
        <AnimatePresence initial={false}>
          {expanded ? (
            <motion.div
              key="earlier-activities"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.4, ease: [0.04, 0.62, 0.23, 0.98] }}
              className="overflow-hidden"
            >
              <div className="space-y-2 border-b border-border/30 pb-2">
                {earlier.map((activity) => (
                  <ActivityRow key={activity.id} activity={activity} running={running} />
                ))}
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
        <ActivityRow activity={latest} running={running} />
      </div>
    </div>
  );
}

function AssistantMessage({ content }: { content: string }) {
  const html = React.useMemo(() => renderGenieMarkdown(content, { compact: true }), [content]);
  return (
    <div
      className="genie-chat-selectable genie-chat-prose max-w-[95%] cursor-text text-sm leading-relaxed text-foreground [&_p]:mb-1.5 [&_p:last-child]:mb-0"
      dir="ltr"
      style={{ unicodeBidi: "isolate" }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function UploadedImagePreview({
  image,
  onRemove,
}: {
  image: CrmEmailImageAttachment;
  onRemove?: () => void;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-md border border-border/60 bg-white p-1.5">
      <img
        src={image.url}
        alt={image.name}
        className="size-10 shrink-0 rounded-md object-cover"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium text-foreground">{image.name}</p>
        {image.width && image.height ? (
          <p className="text-[11px] text-muted-foreground">
            {image.width} × {image.height}
          </p>
        ) : null}
      </div>
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-gray-100 hover:text-foreground"
          aria-label={`Remove ${image.name}`}
        >
          <X className="size-3.5" />
        </button>
      ) : null}
    </div>
  );
}

function ImageAttachmentAccessory({
  images,
  uploading,
  onRemove,
}: {
  images: CrmEmailImageAttachment[];
  uploading: boolean;
  onRemove: (id: string) => void;
}) {
  if (images.length === 0 && !uploading) return null;

  return (
    <div className="space-y-2">
      {images.length > 0 ? (
        <div className="grid gap-1.5">
          {images.map((image) => (
            <UploadedImagePreview
              key={image.id}
              image={image}
              onRemove={() => onRemove(image.id)}
            />
          ))}
        </div>
      ) : null}
      {uploading ? (
        <div className="flex items-center gap-2 rounded-md border border-border/60 bg-white px-2.5 py-2 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" />
          Uploading image…
        </div>
      ) : null}
    </div>
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
  onPromptChange: (v: string) => void;
  onSubmit: () => void;
  onStop: () => void;
  onSuggestion: (text: string) => void;
  chatScrollRef: React.RefObject<HTMLDivElement | null>;
  uploadedImages: CrmEmailImageAttachment[];
  uploadingImage: boolean;
  onImageSelected: (file: File) => void;
  onRemoveUploadedImage: (id: string) => void;
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
    onPromptChange,
    onSubmit,
    onStop,
    onSuggestion,
    chatScrollRef,
    uploadedImages,
    uploadingImage,
    onImageSelected,
    onRemoveUploadedImage,
  } = props;

  return (
    <aside className="flex w-[min(380px,32%)] shrink-0 flex-col border-r border-border/60 bg-white">
      <div className="shrink-0 border-b border-border/40 px-4 py-3">
        <p className="text-sm font-semibold text-foreground">AI Campaign</p>
        <p className="text-xs text-muted-foreground">Type your request below</p>
      </div>

      <div
        ref={chatScrollRef}
        className="genie-chat-selectable min-h-0 flex-1 overflow-y-auto px-4 py-4"
      >
        <div className="space-y-3.5">
          {transcript.map((item) => {
              if (item.kind === "user") {
                if (item.designSelections?.length) {
                  return (
                    <div key={item.id} className="flex justify-end">
                      <VisualEditUserBubble
                        content={item.content}
                        selections={item.designSelections}
                      />
                    </div>
                  );
                }
                return (
                  <div key={item.id} className="flex justify-end">
                    <div className="genie-chat-selectable genie-chat-bubble-user max-w-[92%] cursor-text rounded-[18px] bg-primary px-3.5 py-2 text-sm leading-snug text-primary-foreground">
                      {item.uploadedImages?.length ? (
                        <div className="mb-2 grid gap-1.5">
                          {item.uploadedImages.map((image) => (
                            <div
                              key={image.id}
                              className="overflow-hidden rounded-md bg-white/15 ring-1 ring-white/20"
                            >
                              <img
                                src={image.url}
                                alt={image.name}
                                className="max-h-36 w-full object-cover"
                              />
                            </div>
                          ))}
                        </div>
                      ) : null}
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
      </div>

      <div className="relative shrink-0 bg-gradient-to-t from-[#f8fafc] via-[#f8fafc] to-transparent px-4 pb-4 pt-5">
        <HomeV2ChatInput
          compact
          value={prompt}
          isRunning={running}
          onChange={onPromptChange}
          onSubmit={onSubmit}
          onStop={onStop}
          placeholder={hasStarted ? "Refine or follow up" : "Describe your campaign"}
          showDisclaimer={false}
          onFileSelected={onImageSelected}
          fileAccept="image/jpeg,image/png,image/webp,image/avif"
          fileButtonLabel="Attach image for this email"
          canSubmitWithoutText={uploadedImages.length > 0}
          inputAccessory={
            uploadedImages.length > 0 || uploadingImage ? (
              <ImageAttachmentAccessory
                images={uploadedImages}
                uploading={uploadingImage}
                onRemove={onRemoveUploadedImage}
              />
            ) : undefined
          }
        />
      </div>
    </aside>
  );
}

function EmptyStateDropdown(props: {
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  const [isOpen, setIsOpen] = React.useState(false);
  const Icon = props.icon;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        className={cn(
          "flex h-9 items-center gap-1.5 rounded-full border border-gray-200 bg-white px-4 text-xs font-medium text-foreground shadow-sm transition-colors hover:border-gray-300 hover:bg-gray-50",
          isOpen && "border-gray-400 bg-gray-50",
        )}
        aria-expanded={isOpen}
      >
        {Icon ? <Icon className="size-3.5 shrink-0 text-gray-500" /> : null}
        <span className="whitespace-nowrap">{props.label}</span>
        <ChevronDown
          className={cn(
            "size-3.5 shrink-0 text-gray-400 transition-transform duration-200",
            isOpen && "rotate-180",
          )}
        />
      </button>
      <AnimatePresence initial={false}>
        {isOpen ? (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{
              duration: 0.4,
              ease: [0.04, 0.62, 0.23, 0.98],
            }}
            className="absolute left-1/2 top-[calc(100%+0.375rem)] z-10 w-[min(100vw-2rem,18rem)] -translate-x-1/2 overflow-hidden"
          >
            <div className="rounded-xl border border-border/60 bg-white p-0.5 shadow-lg">
              {props.children}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
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
  previewDesignMode: boolean;
  onPreviewDesignModeChange: (active: boolean) => void;
  onSubmitVisualEdit: (selections: EmailPreviewDesignSelection[], text: string) => void;
  onDirectHtmlEdit: (bodyHtml: string) => void;
  previewEditorRef: React.RefObject<EmailPreviewEditorHandle | null>;
  onInlineEditStart: (state: EmailInlineEditState) => void;
  onInlineEditEnd: () => void;
  specsCollapsed: boolean;
  onToggleSpecsCollapsed: () => void;
  showSpecsPanelToggle: boolean;
  templates: CrmEmailTemplateRecord[];
  premadeTemplates: CrmEmailTemplateRecord[];
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
  previewFirstName: string | null;
}) {
  const {
    store,
    campaign,
    running,
    hasStarted,
    selectedSubject,
    previewMode,
    onPreviewModeChange,
    previewDesignMode,
    onPreviewDesignModeChange,
    onSubmitVisualEdit,
    onDirectHtmlEdit,
    previewEditorRef,
    onInlineEditStart,
    onInlineEditEnd,
    specsCollapsed,
    onToggleSpecsCollapsed,
    showSpecsPanelToggle,
    templates,
    premadeTemplates,
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
    previewFirstName,
  } = props;
  const subject = applyMergeTags(
    campaign?.subjectVariants[selectedSubject] ?? campaign?.subject ?? "",
    { firstName: previewFirstName },
  );
  const toolbarControl =
    "inline-flex h-8 shrink-0 items-center gap-1 rounded-lg border px-2 text-xs font-medium transition-colors @min-[560px]/preview:px-2.5";
  const toolbarLabel = "hidden @min-[560px]/preview:inline";

  return (
    <main className="@container/preview flex min-w-0 flex-1 flex-col bg-gray-100/70">
      <div className="flex shrink-0 flex-col gap-2.5 border-b border-border/40 bg-white px-3 py-2.5 @min-[520px]/preview:flex-row @min-[520px]/preview:items-center @min-[520px]/preview:justify-between @min-[520px]/preview:gap-3 @min-[520px]/preview:px-4">
        <div className="min-w-0 @min-[520px]/preview:flex-1">
          <p className="truncate text-sm font-semibold text-foreground">Email preview</p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {subject || "Designed live as the agent works"}
          </p>
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-1.5 @min-[520px]/preview:max-w-[62%] @min-[520px]/preview:justify-end @min-[520px]/preview:gap-2">
          <div className="flex h-8 items-center rounded-lg border border-border/60 p-0.5">
            <button
              type="button"
              onClick={() => onPreviewModeChange("desktop")}
              className={cn(
                "flex h-full items-center rounded-full px-2.5 text-xs font-medium transition-colors",
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
                "flex h-full items-center rounded-full px-2.5 text-xs font-medium transition-colors",
                previewMode === "mobile"
                  ? "bg-zinc-900 text-white"
                  : "text-muted-foreground hover:text-foreground",
              )}
              aria-label="Mobile preview"
            >
              <Smartphone className="size-3.5" />
            </button>
          </div>

          {campaign ? (
            <button
              type="button"
              onClick={() => onPreviewDesignModeChange(!previewDesignMode)}
              className={cn(
                toolbarControl,
                previewDesignMode
                  ? "border-zinc-900 bg-zinc-900 text-white"
                  : "border-border/60 text-foreground hover:bg-gray-50",
              )}
              aria-pressed={previewDesignMode}
              title="Pick element"
            >
              <MousePointerClick className="size-3.5 shrink-0" />
              <span className={toolbarLabel}>Pick element</span>
            </button>
          ) : null}

          <div ref={templatesRef} className="relative">
            <button
              type="button"
              onClick={() => onTemplatesOpenChange(!templatesOpen)}
              className={cn(toolbarControl, "border-border/60 text-foreground hover:bg-gray-50")}
              title="Templates"
            >
              <Layers className="size-3.5 shrink-0" />
              <span className={toolbarLabel}>Templates</span>
              <ChevronDown
                className={cn("h-3 w-3 shrink-0 transition-transform duration-200", templatesOpen && "rotate-180")}
              />
            </button>
            <AnimatePresence>
              {templatesOpen ? (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.15 }}
                  className="absolute right-0 top-full z-20 mt-1 w-80 overflow-hidden rounded-xl border border-border/60 bg-white shadow-lg"
                >
                  <div className="max-h-96 overflow-y-auto py-1">
                    <p className="px-3.5 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Your templates
                    </p>
                    {templates.length === 0 ? (
                      <p className="px-3.5 pb-2 text-xs text-muted-foreground">
                        Nothing saved yet. Build a design you like, then hit “Save as template”.
                      </p>
                    ) : (
                      templates.map((template) => (
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
                      ))
                    )}

                    <p className="border-t border-border/40 px-3.5 pb-1 pt-2.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Pre-made designs
                    </p>
                    {premadeTemplates.map((template) => (
                      <button
                        key={template.id}
                        type="button"
                        onClick={() => onApplyTemplate(template)}
                        className="w-full px-3.5 py-2.5 text-left transition-colors hover:bg-gray-50"
                      >
                        <p className="truncate text-sm font-medium text-foreground">{template.name}</p>
                        <p className="truncate text-xs text-muted-foreground">{template.description}</p>
                      </button>
                    ))}
                  </div>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>

          {showSpecsPanelToggle ? (
            <button
              type="button"
              onClick={onToggleSpecsCollapsed}
              aria-label={specsCollapsed ? "Show campaign panel" : "Hide campaign panel"}
              title={specsCollapsed ? "Show campaign panel" : "Hide campaign panel"}
              className={cn(
                toolbarControl,
                "border-border/60 text-foreground hover:bg-gray-50",
                !specsCollapsed && "border-zinc-400 bg-gray-50",
              )}
            >
              {specsCollapsed ? (
                <PanelRightOpen className="size-3.5 shrink-0" />
              ) : (
                <PanelRightClose className="size-3.5 shrink-0" />
              )}
            </button>
          ) : null}

          {campaign ? (
            showSaveTemplate ? (
              <div className="flex w-full min-w-0 flex-wrap items-center gap-1.5 @min-[520px]/preview:w-auto">
                <Input
                  autoFocus
                  value={templateNameDraft}
                  onChange={(e) => onTemplateNameChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") onSaveTemplate();
                    if (e.key === "Escape") onShowSaveTemplate(false);
                  }}
                  placeholder="Template name…"
                  className="h-8 min-w-0 flex-1 text-xs @min-[520px]/preview:w-40 @min-[520px]/preview:flex-none"
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
                className="h-8 shrink-0 px-2 text-xs @min-[560px]/preview:px-3"
                onClick={() => onShowSaveTemplate(true)}
                title="Save as template"
              >
                <span className={toolbarLabel}>Save as template</span>
                <span className="@min-[560px]/preview:hidden">Save</span>
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
            <DesignModeEmailPreview
              ref={previewEditorRef}
              templateKey={campaign.templateKey}
              content={campaign.content}
              store={store}
              className="min-h-[480px] flex-1"
              previewFirstName={previewFirstName}
              designModeActive={previewDesignMode}
              onDesignModeActiveChange={onPreviewDesignModeChange}
              onSubmitVisualEdit={onSubmitVisualEdit}
              onDirectHtmlEdit={onDirectHtmlEdit}
              onInlineEditStart={onInlineEditStart}
              onInlineEditEnd={onInlineEditEnd}
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
          <div className="flex h-full items-center justify-center px-6">
            <p className="text-sm text-muted-foreground">
              {hasStarted ? "Your email will appear here." : "Start chatting to preview your email."}
            </p>
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
  audience: CrmNamedAudience | null;
  selectedCount: number;
  excludedContactIds: Set<string>;
  onToggleContact: (contactId: string, included: boolean) => void;
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
  testEmail: string;
  onTestEmailChange: (v: string) => void;
  onSendTest: () => void;
  sendingTest: boolean;
  testResult: { kind: "success" | "error"; text: string } | null;
}) {
  const {
    audience,
    selectedCount,
    excludedContactIds,
    onToggleContact,
    products,
    campaign,
    verification,
    running,
    selectedSubject,
    onSelectSubject,
    sendPlan,
    onSendPlanChange,
    creating,
    onCreateDraft,
    onOpenComposer,
    testEmail,
    onTestEmailChange,
    onSendTest,
    sendingTest,
    testResult,
  } = props;

  const empty = !audience && !campaign;
  const failedChecks = verification?.checks.filter((check) => !check.ok) ?? [];
  const selectedSubjectText =
    campaign?.subjectVariants[selectedSubject] ?? campaign?.subject ?? "";
  const [membersOpen, setMembersOpen] = React.useState(false);
  const [confirmSendNow, setConfirmSendNow] = React.useState(false);

  React.useEffect(() => {
    setConfirmSendNow(false);
  }, [sendPlan.mode, selectedCount, campaign?.subject]);

  const handlePrimarySendAction = React.useCallback(() => {
    if (sendPlan.mode === "send_now" && !confirmSendNow) {
      setConfirmSendNow(true);
      return;
    }
    onCreateDraft();
  }, [confirmSendNow, onCreateDraft, sendPlan.mode]);

  return (
    <aside className="flex w-[min(330px,28%)] shrink-0 flex-col overflow-hidden border-l border-border/60 bg-white">
      <div className="shrink-0 border-b border-border/40 px-4 py-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">Campaign</p>
          <p className="text-xs text-muted-foreground">Who gets it, and when</p>
        </div>
      </div>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
              {empty ? (
                <p className="text-sm leading-relaxed text-muted-foreground">
                  Recipients, subject, and send update here as you go.
                </p>
              ) : (
                <div className="flex flex-col gap-4">
                  {/* ——— Summary ——— */}
                  <div className="rounded-xl border border-border/50 bg-gray-50/60 p-3.5">
                    {audience ? (
                      <div className="flex items-center gap-2.5">
                        <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-border/50">
                          <Users className="size-4 text-gray-500" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-lg font-semibold leading-tight tabular-nums text-foreground">
                            {selectedCount.toLocaleString()}
                            <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                              recipient{selectedCount === 1 ? "" : "s"}
                            </span>
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {audience.name ?? "Matched audience"} · verified
                            {excludedContactIds.size > 0
                              ? ` · ${excludedContactIds.size.toLocaleString()} excluded`
                              : ""}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        No audience yet. Ask the agent who this should go to.
                      </p>
                    )}

                    {campaign ? (
                      <div className={cn(audience && "mt-3 border-t border-border/40 pt-3")}>
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                            Subject
                          </p>
                          {campaign.subjectVariants.length > 1 ? (
                            <div className="flex gap-1">
                              {campaign.subjectVariants.map((_, index) => (
                                <button
                                  key={index}
                                  type="button"
                                  onClick={() => onSelectSubject(index)}
                                  aria-label={`Subject option ${index + 1}`}
                                  className={cn(
                                    "flex size-5 items-center justify-center rounded-md text-[10px] font-semibold transition-colors",
                                    selectedSubject === index
                                      ? "bg-zinc-900 text-white"
                                      : "bg-white text-muted-foreground ring-1 ring-border/50 hover:text-foreground",
                                  )}
                                >
                                  {String.fromCharCode(65 + index)}
                                </button>
                              ))}
                            </div>
                          ) : null}
                        </div>
                        <p className="mt-1 text-sm font-medium leading-snug text-foreground">
                          {selectedSubjectText}
                        </p>
                      </div>
                    ) : null}
                  </div>

                  {/* ——— Send ——— */}
                  {campaign ? (
                    <div className="space-y-2.5">
                      <div className="flex items-center rounded-full bg-gray-100 p-0.5">
                        {(
                          [
                            { id: "draft", label: "Draft" },
                            { id: "send_now", label: "Send now" },
                            { id: "schedule", label: "Schedule" },
                          ] as const
                        ).map((option) => (
                          <button
                            key={option.id}
                            type="button"
                            onClick={() => {
                              setConfirmSendNow(false);
                              onSendPlanChange((plan) => ({ ...plan, mode: option.id }));
                            }}
                            className={cn(
                              "flex-1 rounded-full px-2 py-1.5 text-xs font-medium transition-colors",
                              sendPlan.mode === option.id
                                ? "bg-white text-foreground shadow-sm"
                                : "text-muted-foreground hover:text-foreground",
                            )}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>

                      {sendPlan.mode === "schedule" ? (
                        <div className="space-y-2 rounded-md border border-border/40 p-2.5">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-[11px] font-medium text-muted-foreground">
                              Schedule time
                            </p>
                            <span className="shrink-0 rounded-md bg-white px-2 py-0.5 text-[10px] font-medium text-foreground ring-1 ring-border/60">
                              Melbourne, Australia
                            </span>
                          </div>
                          <Input
                            type="datetime-local"
                            value={sendPlan.scheduledAt}
                            onChange={(e) =>
                              onSendPlanChange((plan) => ({ ...plan, scheduledAt: e.target.value }))
                            }
                            className="h-8 text-xs"
                          />
                          <p className="text-[11px] leading-snug text-muted-foreground">
                            Times are scheduled in Melbourne time ({MELBOURNE_TIME_ZONE}).
                          </p>
                          <div className="flex items-center gap-2">
                            <select
                              value={sendPlan.scheduleType}
                              onChange={(e) =>
                                onSendPlanChange((plan) => ({
                                  ...plan,
                                  scheduleType: e.target.value as SendPlan["scheduleType"],
                                }))
                              }
                              className="h-8 flex-1 rounded-md border border-input bg-background px-2 text-xs"
                            >
                              <option value="once">Once</option>
                              <option value="weekly">Weekly</option>
                              <option value="monthly">Monthly</option>
                            </select>
                            <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                              <Checkbox
                                checked={sendPlan.autoSend}
                                onCheckedChange={(checked) =>
                                  onSendPlanChange((plan) => ({ ...plan, autoSend: checked === true }))
                                }
                              />
                              Auto-send
                            </label>
                          </div>
                        </div>
                      ) : null}

                      {confirmSendNow && sendPlan.mode === "send_now" ? (
                        <div className="rounded-md border border-amber-200 bg-white p-2.5">
                          <div className="flex items-start gap-2">
                            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
                            <div className="min-w-0">
                              <p className="text-xs font-semibold text-foreground">
                                Confirm live send
                              </p>
                              <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                                This will email {selectedCount.toLocaleString()} recipient
                                {selectedCount === 1 ? "" : "s"} now. This cannot be undone.
                              </p>
                            </div>
                          </div>
                          <div className="mt-2 flex gap-1.5">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 flex-1 text-xs"
                              onClick={() => setConfirmSendNow(false)}
                              disabled={creating}
                            >
                              Cancel
                            </Button>
                            <Button
                              size="sm"
                              className="h-8 flex-1 bg-amber-600 text-xs text-white hover:bg-amber-700"
                              onClick={handlePrimarySendAction}
                              disabled={creating || running || !audience || selectedCount === 0}
                            >
                              {creating ? (
                                <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                              ) : (
                                <Send className="mr-1.5 size-3.5" />
                              )}
                              Confirm send
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <Button
                          size="sm"
                          className="w-full"
                          onClick={handlePrimarySendAction}
                          disabled={creating || running || !audience || selectedCount === 0}
                        >
                          {creating ? (
                            <Loader2 className="mr-1.5 size-4 animate-spin" />
                          ) : (
                            <Send className="mr-1.5 size-4" />
                          )}
                          {sendPlan.mode === "send_now"
                            ? `Send to ${audience ? selectedCount.toLocaleString() : "…"} recipient${selectedCount === 1 ? "" : "s"}`
                            : sendPlan.mode === "schedule"
                              ? "Schedule campaign"
                              : "Save as draft"}
                        </Button>
                      )}

                      <div className="flex gap-1.5">
                        <Input
                          type="email"
                          value={testEmail}
                          onChange={(e) => onTestEmailChange(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") onSendTest();
                          }}
                          placeholder="you@email.com"
                          className="h-8 flex-1 text-xs"
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 shrink-0 text-xs"
                          onClick={onSendTest}
                          disabled={sendingTest || !testEmail.trim()}
                        >
                          {sendingTest ? (
                            <Loader2 className="size-3.5 animate-spin" />
                          ) : (
                            "Send test"
                          )}
                        </Button>
                      </div>
                      {testResult ? (
                        <p
                          className={cn(
                            "flex items-center gap-1 text-[11px]",
                            testResult.kind === "success" ? "text-emerald-600" : "text-red-600",
                          )}
                        >
                          {testResult.kind === "success" ? (
                            <Check className="size-3" />
                          ) : (
                            <AlertTriangle className="size-3" />
                          )}
                          {testResult.text}
                        </p>
                      ) : null}
                    </div>
                  ) : null}

                  {/* ——— Details (collapsed by default) ——— */}
                  <div className="border-t border-border/40">
                    {audience && (audience.funnel?.length || audience.sample.length > 0) ? (
                      <AccordionSection title="How this audience was built">
                        {audience.funnel && audience.funnel.length > 0 ? (
                          <div className="rounded-lg bg-gray-50/70 px-2.5 py-1">
                            {audience.funnel.map((step, index) => (
                              <div
                                key={`${step.label}-${index}`}
                                className={cn(
                                  "flex items-baseline justify-between gap-2 py-1.5",
                                  index > 0 && "border-t border-border/30",
                                )}
                              >
                                <div className="min-w-0">
                                  <p className="truncate text-xs text-foreground">{step.label}</p>
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
                          <ul className="mt-2 space-y-1">
                            {audience.sample.slice(0, 4).map((contact) => (
                              <li
                                key={contact.id}
                                className="flex items-baseline justify-between gap-2 text-xs"
                              >
                                <span className="truncate text-foreground">
                                  {[contact.first_name, contact.last_name].filter(Boolean).join(" ") ||
                                    contact.email}
                                </span>
                                <span className="shrink-0 text-[11px] text-muted-foreground">
                                  {formatAud(contact.total_spend)} · {contact.sale_count} visit
                                  {contact.sale_count === 1 ? "" : "s"}
                                </span>
                              </li>
                            ))}
                          </ul>
                        ) : null}
                        {audience.sort ? (
                          <p className="mt-2 text-[11px] text-muted-foreground">{audience.sort.label}</p>
                        ) : null}
                        <SeeAllCustomersButton
                          count={audience.count}
                          excludedCount={excludedContactIds.size}
                          onClick={() => setMembersOpen(true)}
                        />
                      </AccordionSection>
                    ) : null}

                    {audience ? (
                      <AudienceMembersDialog
                        open={membersOpen}
                        onOpenChange={setMembersOpen}
                        audienceName={audience.name}
                        totalCount={audience.count}
                        selectedCount={selectedCount}
                        excludedContactIds={excludedContactIds}
                        onToggleContact={onToggleContact}
                        rules={audience.rules}
                      />
                    ) : null}

                    {products.length > 0 ? (
                      <AccordionSection title={`Featured products (${products.length})`}>
                        <ul className="space-y-1.5">
                          {products.map((product, index) => (
                            <li
                              key={`${product.productId ?? product.title}-${index}`}
                              className="flex items-center gap-2.5"
                            >
                              {product.imageUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={product.imageUrl}
                                  alt=""
                                  className="size-9 shrink-0 rounded-md border border-border/30 bg-white object-contain"
                                />
                              ) : (
                                <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-gray-100 text-[9px] text-muted-foreground">
                                  No img
                                </div>
                              )}
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-xs text-foreground">{product.title}</p>
                                <p className="truncate text-[11px] text-muted-foreground">
                                  {product.price}
                                  {product.originalPrice ? (
                                    <span className="ml-1 line-through">{product.originalPrice}</span>
                                  ) : null}
                                  {product.badge ? (
                                    <span className="ml-1 font-semibold text-red-600">{product.badge}</span>
                                  ) : null}
                                </p>
                              </div>
                            </li>
                          ))}
                        </ul>
                      </AccordionSection>
                    ) : null}

                    {verification ? (
                      <AccordionSection
                        title="Quality checks"
                        hint={
                          failedChecks.length === 0
                            ? "All passed"
                            : `${failedChecks.length} to fix`
                        }
                        hintTone={failedChecks.length === 0 ? "ok" : "warn"}
                        defaultOpen={failedChecks.length > 0}
                      >
                        <ul className="space-y-1.5">
                          {verification.checks.map((check) => (
                            <li key={check.label} className="flex items-start gap-2 text-xs">
                              {check.ok ? (
                                <Check className="mt-0.5 size-3.5 shrink-0 text-emerald-500" />
                              ) : (
                                <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber-500" />
                              )}
                              <div className="min-w-0">
                                <span className="text-foreground">{check.label}</span>
                                {check.detail ? (
                                  <span className="ml-1 text-muted-foreground">{check.detail}</span>
                                ) : null}
                              </div>
                            </li>
                          ))}
                        </ul>
                      </AccordionSection>
                    ) : null}

                  </div>

                  {campaign ? (
                    <button
                      type="button"
                      onClick={onOpenComposer}
                      disabled={running}
                      className="self-start text-xs font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline disabled:opacity-50"
                    >
                      Edit manually in composer
                    </button>
                  ) : null}
                </div>
              )}
            </div>
      </div>
    </aside>
  );
}

function AccordionSection(props: {
  title: string;
  hint?: string;
  hintTone?: "ok" | "warn";
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(props.defaultOpen ?? false);
  return (
    <section className="border-b border-border/40">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full items-center justify-between gap-2 py-2.5 text-left"
      >
        <span className="text-xs font-medium text-foreground">{props.title}</span>
        <span className="flex shrink-0 items-center gap-1.5">
          {props.hint ? (
            <span
              className={cn(
                "text-[11px]",
                props.hintTone === "ok"
                  ? "text-emerald-600"
                  : props.hintTone === "warn"
                    ? "text-amber-600"
                    : "text-muted-foreground",
              )}
            >
              {props.hint}
            </span>
          ) : null}
          <ChevronDown
            className={cn(
              "size-3.5 text-muted-foreground transition-transform duration-200",
              open && "rotate-180",
            )}
          />
        </span>
      </button>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.04, 0.62, 0.23, 0.98] }}
            className="overflow-hidden"
          >
            <div className="pb-3">{props.children}</div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </section>
  );
}
