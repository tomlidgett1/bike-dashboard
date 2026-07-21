"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  CalendarClock,
  ChevronDown,
  ExternalLink,
  History,
  Loader2,
  Megaphone,
  Pencil,
  Sparkles,
  Trash2,
} from "lucide-react";
import { Calendar } from "@/components/layout/app-sidebar/dashboard-icons";
import {
  defaultMelbourneScheduleLocal,
  formatMelbourneTime,
  melbourneLocalDateTimeToIso,
  toMelbourneDateTimeLocal,
} from "@/lib/blog/melbourne-time";
import { HomeV2ChatInput } from "@/components/genie/homev2-chat-input";
import { SlidingNavTabs } from "@/components/layout/sliding-nav-tabs";
import { InstagramCampaignComposer } from "@/components/settings/instagram-campaign-composer";
import { InstagramCampaignReview } from "@/components/settings/instagram-campaign-review";
import { InstagramFormatBadges } from "@/components/settings/instagram-format-badges";
import { InstagramLogo } from "@/components/settings/instagram-logo";
import { InstagramPostPreview } from "@/components/settings/instagram-post-preview";
import { InstagramProductPickerDialog } from "@/components/settings/instagram-product-picker-dialog";
import {
  InstagramPhotoStrip,
  type InstagramAttachedPhoto,
} from "@/components/settings/instagram-photo-strip";
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
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  type InstagramDestination,
  type InstagramFormat,
  type InstagramPostAspect,
  resolveInstagramFormat,
} from "@/lib/instagram/formats";
import type { InstagramCampaign } from "@/lib/instagram/campaign-types";
import type { InstagramCatalogueProduct } from "@/lib/instagram/catalogue";
import { cn } from "@/lib/utils";

type InstagramTab = "create" | "schedule" | "history";
type InstagramCreateMode = "single" | "campaign";

type InstagramStatus = {
  oauthConfigured: boolean;
  connected: boolean;
  username: string | null;
  accountName: string | null;
  connectedAccountId: string | null;
  connectedAt: string | null;
  logoUrl: string | null;
  lastError: string | null;
};

type InstagramPostRow = {
  id: string;
  prompt: string | null;
  caption: string;
  image_url: string | null;
  image_urls?: string[] | null;
  status: string;
  campaign_id: string | null;
  day_index: number | null;
  scheduled_at: string | null;
  destination?: string | null;
  aspect?: string | null;
  instagram_media_id: string | null;
  permalink: string | null;
  error_message: string | null;
  created_at: string;
  posted_at: string | null;
};

const TAB_ITEMS = [
  { id: "create", label: "Create post", icon: Sparkles },
  { id: "schedule", label: "Schedule", icon: CalendarClock },
  { id: "history", label: "History", icon: History },
] as const;

const PAGE_BG =
  "bg-[radial-gradient(circle_at_top,rgba(250,204,21,0.10),transparent_34%),linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)]";

const BUILD_STAGES = [
  "Building your image…",
  "Sketching the composition…",
  "Writing a caption…",
  "Rendering lighting and detail…",
  "Uploading and finishing…",
] as const;

function isInstagramTab(value: string | null): value is InstagramTab {
  return TAB_ITEMS.some((item) => item.id === value);
}

function BuildingImagePanel({ format }: { format: InstagramFormat }) {
  const [stageIndex, setStageIndex] = React.useState(0);
  const [elapsedSec, setElapsedSec] = React.useState(0);

  React.useEffect(() => {
    setStageIndex(0);
    setElapsedSec(0);
    const stageTimer = window.setInterval(() => {
      setStageIndex((current) =>
        Math.min(current + 1, BUILD_STAGES.length - 1),
      );
    }, 8000);
    const clockTimer = window.setInterval(() => {
      setElapsedSec((current) => current + 1);
    }, 1000);
    return () => {
      window.clearInterval(stageTimer);
      window.clearInterval(clockTimer);
    };
  }, []);

  return (
    <div
      className="mx-auto w-full max-w-md"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div
        className="relative overflow-hidden rounded-2xl bg-[#f2f2f7] shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
        style={{ aspectRatio: `${format.width} / ${format.height}` }}
      >
        <div className="absolute inset-0 bg-[#f2f2f7]" />
        <div className="absolute inset-0 flex flex-col items-center justify-center px-8 text-center">
          <div className="relative mb-5 flex h-14 w-14 items-center justify-center">
            {[0, 1, 2].map((ring) => (
              <motion.div
                key={ring}
                className="absolute rounded-full border border-gray-300/60"
                initial={{ width: 18, height: 18, opacity: 0 }}
                animate={{
                  width: [18, 56],
                  height: [18, 56],
                  opacity: [0.55, 0],
                }}
                transition={{
                  duration: 2.2,
                  ease: [0.04, 0.62, 0.23, 0.98],
                  repeat: Infinity,
                  delay: ring * 0.7,
                }}
              />
            ))}
            <motion.div
              className="h-2.5 w-2.5 rounded-full bg-gray-500/80"
              animate={{ scale: [1, 1.2, 1], opacity: [0.6, 1, 0.6] }}
              transition={{
                duration: 1.5,
                ease: "easeInOut",
                repeat: Infinity,
              }}
            />
          </div>
          <div className="relative h-[1.4em] w-full overflow-hidden">
            <AnimatePresence initial={false}>
              <motion.p
                key={BUILD_STAGES[stageIndex]}
                initial={{ y: "110%", opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: "-110%", opacity: 0 }}
                transition={{
                  duration: 0.45,
                  ease: [0.04, 0.62, 0.23, 0.98],
                }}
                className="absolute inset-x-0 text-[15px] font-medium tracking-tight text-gray-800"
              >
                {BUILD_STAGES[stageIndex]}
              </motion.p>
            </AnimatePresence>
          </div>
          <p className="mt-1.5 text-xs text-gray-500">
            {elapsedSec < 5
              ? "This usually takes 30 to 60 seconds"
              : `${elapsedSec}s · keep this tab open`}
          </p>
        </div>
      </div>
    </div>
  );
}

function formatWhen(iso: string | null) {
  if (!iso) return "-";
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) return "-";
  return formatMelbourneTime(new Date(parsed));
}

function statusLabel(status: string) {
  if (status === "posted") return "Posted";
  if (status === "draft") return "Draft";
  if (status === "failed") return "Failed";
  if (status === "processing") return "Publishing";
  if (status === "scheduled") return "Scheduled";
  return status;
}

function postTypeLabel(post: InstagramPostRow, imageCount: number) {
  if (imageCount > 1) return "Carousel";
  if (post.destination === "story") return "Story";
  return "Feed post";
}

function defaultCampaignStart() {
  const next = new Date();
  next.setDate(next.getDate() + 1);
  next.setHours(9, 0, 0, 0);
  const offset = next.getTimezoneOffset() * 60_000;
  return new Date(next.getTime() - offset).toISOString().slice(0, 16);
}

function captionsForCampaign(campaign: InstagramCampaign) {
  return Object.fromEntries(
    campaign.days.map((day) => [day.dayIndex, day.caption]),
  ) as Record<number, string>;
}

export function StoreInstagramPanel() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const requestedTab = searchParams.get("tab");

  const [selectedTab, setSelectedTab] = React.useState<InstagramTab>(
    isInstagramTab(requestedTab) ? requestedTab : "create",
  );
  const [status, setStatus] = React.useState<InstagramStatus | null>(null);
  const [posts, setPosts] = React.useState<InstagramPostRow[]>([]);
  const [campaigns, setCampaigns] = React.useState<InstagramCampaign[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [connecting, setConnecting] = React.useState(false);
  const [disconnecting, setDisconnecting] = React.useState(false);
  const [generating, setGenerating] = React.useState(false);
  const [publishing, setPublishing] = React.useState(false);
  const [schedulingPost, setSchedulingPost] = React.useState(false);
  const [scheduleAtLocal, setScheduleAtLocal] = React.useState(
    defaultMelbourneScheduleLocal,
  );
  const [error, setError] = React.useState<string | null>(null);

  const [prompt, setPrompt] = React.useState("");
  const [caption, setCaption] = React.useState("");
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);
  const [draftPostId, setDraftPostId] = React.useState<string | null>(null);
  const [destination, setDestination] =
    React.useState<InstagramDestination>("post");
  const [aspect, setAspect] = React.useState<InstagramPostAspect>("square");
  const [includeLogo, setIncludeLogo] = React.useState(false);
  const [selectedProduct, setSelectedProduct] =
    React.useState<InstagramCatalogueProduct | null>(null);
  const [productPickerOpen, setProductPickerOpen] = React.useState(false);
  const [attachedPhotos, setAttachedPhotos] = React.useState<
    InstagramAttachedPhoto[]
  >([]);
  const [createMode, setCreateMode] =
    React.useState<InstagramCreateMode>("single");
  const [campaignObjective, setCampaignObjective] = React.useState("");
  const [campaignDuration, setCampaignDuration] = React.useState<5 | 10>(5);
  const [campaignStartAt, setCampaignStartAt] = React.useState(
    defaultCampaignStart,
  );
  const [activeCampaign, setActiveCampaign] =
    React.useState<InstagramCampaign | null>(null);
  const [campaignCaptions, setCampaignCaptions] = React.useState<
    Record<number, string>
  >({});
  const [campaignPlanning, setCampaignPlanning] = React.useState(false);
  const [campaignGeneratingDay, setCampaignGeneratingDay] = React.useState<
    number | null
  >(null);
  const [campaignScheduling, setCampaignScheduling] = React.useState(false);
  const [campaignCancellingId, setCampaignCancellingId] = React.useState<
    string | null
  >(null);
  const [editingScheduledPostId, setEditingScheduledPostId] = React.useState<
    string | null
  >(null);
  const [deletingPostId, setDeletingPostId] = React.useState<string | null>(
    null,
  );
  const [deleteConfirmPostId, setDeleteConfirmPostId] = React.useState<
    string | null
  >(null);

  const selectedFormat = React.useMemo(
    () => resolveInstagramFormat({ destination, aspect }),
    [destination, aspect],
  );
  const storeLogoUrl = status?.logoUrl ?? null;

  React.useEffect(() => {
    if (!storeLogoUrl && includeLogo) setIncludeLogo(false);
  }, [storeLogoUrl, includeLogo]);

  React.useEffect(() => {
    if (attachedPhotos.length > 1 && destination === "story") {
      setDestination("post");
    }
  }, [attachedPhotos.length, destination]);

  const readyPhotoUrls = React.useMemo(
    () =>
      attachedPhotos
        .map((photo) => photo.remoteUrl)
        .filter((url): url is string => Boolean(url)),
    [attachedPhotos],
  );
  const uploadingPhotos = attachedPhotos.some((photo) => photo.uploading);
  const photosReady =
    attachedPhotos.length > 0 &&
    attachedPhotos.every((photo) => Boolean(photo.remoteUrl)) &&
    !uploadingPhotos;

  const scheduledPosts = React.useMemo(
    () =>
      posts
        .filter((post) => post.status === "scheduled" && !post.campaign_id)
        .sort((a, b) => {
          const aTime = a.scheduled_at ? Date.parse(a.scheduled_at) : 0;
          const bTime = b.scheduled_at ? Date.parse(b.scheduled_at) : 0;
          return aTime - bTime;
        }),
    [posts],
  );

  React.useEffect(() => {
    const nextTab = isInstagramTab(requestedTab) ? requestedTab : "create";
    setSelectedTab(nextTab);
  }, [requestedTab]);

  const loadStatus = React.useCallback(async () => {
    const res = await fetch("/api/store/instagram/status", { cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || "Could not load Instagram status.");
    }
    setStatus(data as InstagramStatus);
  }, []);

  const loadPosts = React.useCallback(async () => {
    const res = await fetch("/api/store/instagram/posts", { cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || "Could not load posts.");
    }
    setPosts((data.posts as InstagramPostRow[]) || []);
  }, []);

  const loadCampaigns = React.useCallback(async () => {
    const res = await fetch("/api/store/instagram/campaigns", {
      cache: "no-store",
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || "Could not load campaigns.");
    }
    setCampaigns((data.campaigns as InstagramCampaign[]) || []);
  }, []);

  const refreshAll = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await Promise.all([loadStatus(), loadPosts(), loadCampaigns()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load Instagram.");
    } finally {
      setLoading(false);
    }
  }, [loadCampaigns, loadPosts, loadStatus]);

  React.useEffect(() => {
    void refreshAll();
  }, [refreshAll]);

  React.useEffect(() => {
    const flag = searchParams.get("instagram");
    if (!flag) return;
    if (flag === "connected") {
      void refreshAll();
    }
    const params = new URLSearchParams(searchParams.toString());
    params.delete("instagram");
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [searchParams, router, pathname, refreshAll]);

  function selectTab(nextTab: InstagramTab) {
    setSelectedTab(nextTab);
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", nextTab);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  const handleConnect = async () => {
    try {
      setConnecting(true);
      setError(null);
      const res = await fetch("/api/store/instagram/connect", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.url) {
        throw new Error(data.error || "Could not start Instagram connect.");
      }
      window.location.href = data.url as string;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start connect.");
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    try {
      setDisconnecting(true);
      setError(null);
      const res = await fetch("/api/store/instagram/disconnect", {
        method: "POST",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Could not disconnect.");
      }
      setStatus(data as InstagramStatus);
      setPreviewUrl(null);
      setDraftPostId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not disconnect.");
    } finally {
      setDisconnecting(false);
    }
  };

  const handleAttachPhoto = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      setError("Only image files can be attached.");
      return;
    }
    if (attachedPhotos.length >= 10) {
      setError("Instagram carousels support up to 10 photos.");
      return;
    }

    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `photo-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const previewUrl = URL.createObjectURL(file);
    setAttachedPhotos((current) => [
      ...current,
      { id, previewUrl, uploading: true },
    ]);
    setError(null);

    try {
      const form = new FormData();
      form.append("files", file);
      const res = await fetch("/api/store/instagram/upload", {
        method: "POST",
        body: form,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Could not upload photo.");
      }
      const remoteUrl =
        (Array.isArray(data.imageUrls) && data.imageUrls[0]) ||
        data.images?.[0]?.url ||
        null;
      if (!remoteUrl) {
        throw new Error("Upload did not return a photo URL.");
      }
      setAttachedPhotos((current) =>
        current.map((photo) =>
          photo.id === id
            ? { ...photo, remoteUrl, uploading: false, error: null }
            : photo,
        ),
      );
      if (destination === "story") setDestination("post");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Could not upload photo.";
      setAttachedPhotos((current) =>
        current.map((photo) =>
          photo.id === id
            ? { ...photo, uploading: false, error: message }
            : photo,
        ),
      );
      setError(message);
    }
  };

  const handleRemoveAttachedPhoto = (id: string) => {
    setAttachedPhotos((current) => {
      const target = current.find((photo) => photo.id === id);
      if (target?.previewUrl.startsWith("blob:")) {
        URL.revokeObjectURL(target.previewUrl);
      }
      const next = current.filter((photo) => photo.id !== id);
      if (previewUrl && next.length === 0 && !draftPostId) {
        setPreviewUrl(null);
      }
      return next;
    });
  };

  const handleGenerate = async (nextPrompt?: string) => {
    const value = (nextPrompt ?? prompt).trim();
    if (attachedPhotos.length > 0) {
      if (!photosReady) {
        setError("Wait for uploads to finish, or remove failed photos.");
        return;
      }

      // Prompt and/or logo: run photos through AI edits. No prompt and no logo:
      // continue straight to caption/publish with the attached photos as-is.
      const shouldEditWithAi = Boolean(value) || includeLogo;
      if (shouldEditWithAi) {
        if (includeLogo && !storeLogoUrl) {
          setError(
            "No store logo found. Upload one in Settings → Store profile first.",
          );
          return;
        }
        if (nextPrompt) setPrompt(nextPrompt);
        try {
          setGenerating(true);
          setError(null);
          setDraftPostId(null);
          setPreviewUrl(null);
          if (value) setCaption("");
          const res = await fetch("/api/store/instagram/brand", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              imageUrls: readyPhotoUrls,
              aspect,
              prompt: value || null,
              includeLogo,
              autoCaption: Boolean(value),
              storeUsername: status?.username || "",
            }),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            throw new Error(data.error || "Could not edit photos with AI.");
          }
          const editedUrls = Array.isArray(data.imageUrls)
            ? (data.imageUrls as string[]).filter(
                (url): url is string => typeof url === "string" && Boolean(url),
              )
            : [];
          if (editedUrls.length === 0) {
            throw new Error("AI editing did not return any photos.");
          }

          setAttachedPhotos((current) => {
            const next = current.map((photo, index) => {
              const edited = editedUrls[index];
              if (!edited) return photo;
              if (photo.previewUrl.startsWith("blob:")) {
                URL.revokeObjectURL(photo.previewUrl);
              }
              return {
                ...photo,
                remoteUrl: edited,
                previewUrl: edited,
                uploading: false,
                error: null,
              };
            });
            return next;
          });
          setPreviewUrl(editedUrls[0] || null);
          if (editedUrls.length > 1) setDestination("post");
          if (typeof data.caption === "string" && data.caption.trim()) {
            setCaption(data.caption);
          }
          await loadPosts();
        } catch (err) {
          setError(
            err instanceof Error
              ? err.message
              : "Could not edit photos with AI.",
          );
        } finally {
          setGenerating(false);
        }
        return;
      }

      setError(null);
      setDraftPostId(null);
      setPreviewUrl(readyPhotoUrls[0] || null);
      if (readyPhotoUrls.length > 1) setDestination("post");
      setCaption((current) => current);
      return;
    }

    if (!value) {
      setError("Describe the image you want to create, or attach photos.");
      return;
    }
    if (nextPrompt) setPrompt(nextPrompt);
    try {
      setGenerating(true);
      setError(null);
      setPreviewUrl(null);
      setCaption("");
      const res = await fetch("/api/store/instagram/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: value,
          autoCaption: true,
          storeUsername: status?.username || "",
          destination,
          aspect,
          includeLogo,
          productId: selectedProduct?.id || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Image generation failed.");
      }
      setPreviewUrl(data.imageUrl as string);
      setDraftPostId(data.postId as string);
      if (data.destination === "post" || data.destination === "story") {
        setDestination(data.destination);
      }
      if (data.aspect === "square" || data.aspect === "portrait") {
        setAspect(data.aspect);
      }
      setCaption(
        typeof data.caption === "string" && data.caption.trim()
          ? data.caption
          : "",
      );
      await loadPosts();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Image generation failed.");
    } finally {
      setGenerating(false);
    }
  };

  const handleBuildCampaign = async () => {
    const objective = campaignObjective.trim();
    if (!objective) {
      setError("Describe the story or objective for your campaign.");
      return;
    }
    const start = new Date(campaignStartAt);
    if (Number.isNaN(start.getTime()) || start.getTime() <= Date.now()) {
      setError("Choose a future date and time for the first post.");
      return;
    }

    try {
      setCampaignPlanning(true);
      setError(null);
      const planRes = await fetch("/api/store/instagram/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          objective,
          durationDays: campaignDuration,
          aspect,
          includeLogo,
          productId: selectedProduct?.id || null,
          startAt: start.toISOString(),
          storeUsername: status?.username || "",
        }),
      });
      const planData = await planRes.json().catch(() => ({}));
      if (!planRes.ok || !planData.campaign) {
        throw new Error(planData.error || "Could not plan the campaign.");
      }

      let campaign = planData.campaign as InstagramCampaign;
      setActiveCampaign(campaign);
      setCampaignCaptions(captionsForCampaign(campaign));
      setCampaignPlanning(false);

      for (const day of campaign.days) {
        setCampaignGeneratingDay(day.dayIndex);
        const dayRes = await fetch(
          `/api/store/instagram/campaigns/${campaign.id}/days/${day.dayIndex}`,
          { method: "POST" },
        );
        const dayData = await dayRes.json().catch(() => ({}));
        if (!dayRes.ok || !dayData.campaign) {
          throw new Error(
            dayData.error || `Could not create campaign day ${day.dayIndex}.`,
          );
        }
        campaign = dayData.campaign as InstagramCampaign;
        setActiveCampaign(campaign);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not build campaign.");
    } finally {
      setCampaignPlanning(false);
      setCampaignGeneratingDay(null);
      await Promise.all([loadCampaigns(), loadPosts()]);
    }
  };

  const handleRegenerateCampaignDay = async (dayIndex: number) => {
    if (!activeCampaign) return;
    try {
      setCampaignGeneratingDay(dayIndex);
      setError(null);
      const res = await fetch(
        `/api/store/instagram/campaigns/${activeCampaign.id}/days/${dayIndex}`,
        { method: "POST" },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.campaign) {
        throw new Error(data.error || `Could not regenerate day ${dayIndex}.`);
      }
      setActiveCampaign(data.campaign as InstagramCampaign);
      await loadCampaigns();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : `Could not regenerate day ${dayIndex}.`,
      );
    } finally {
      setCampaignGeneratingDay(null);
    }
  };

  const handleScheduleCampaign = async () => {
    if (!activeCampaign) return;
    try {
      setCampaignScheduling(true);
      setError(null);
      const res = await fetch(
        `/api/store/instagram/campaigns/${activeCampaign.id}/schedule`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            captions: activeCampaign.days.map((day) => ({
              dayIndex: day.dayIndex,
              caption: campaignCaptions[day.dayIndex] ?? day.caption,
            })),
          }),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.campaign) {
        throw new Error(data.error || "Could not schedule campaign.");
      }
      setActiveCampaign(data.campaign as InstagramCampaign);
      await Promise.all([loadCampaigns(), loadPosts()]);
      selectTab("schedule");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not schedule campaign.");
    } finally {
      setCampaignScheduling(false);
    }
  };

  const handleCancelCampaign = async (campaignId: string) => {
    try {
      setCampaignCancellingId(campaignId);
      setError(null);
      const res = await fetch(
        `/api/store/instagram/campaigns/${campaignId}/cancel`,
        { method: "POST" },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Could not cancel campaign.");
      }
      if (activeCampaign?.id === campaignId) {
        setActiveCampaign(null);
        setCampaignCaptions({});
        setCampaignObjective("");
        setCampaignStartAt(defaultCampaignStart());
      }
      await Promise.all([loadCampaigns(), loadPosts()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not cancel campaign.");
    } finally {
      setCampaignCancellingId(null);
    }
  };

  const handleContinueCampaign = (campaign: InstagramCampaign) => {
    setCreateMode("campaign");
    setActiveCampaign(campaign);
    setCampaignObjective(campaign.objective);
    setAspect(campaign.aspect);
    setIncludeLogo(campaign.includeLogo);
    setCampaignDuration(campaign.durationDays);
    setSelectedProduct(
      campaign.productId && campaign.productImageUrl
        ? {
            id: campaign.productId,
            name: campaign.productName || "Selected product",
            brand: null,
            description: null,
            price: null,
            salePrice: null,
            discountPercent: null,
            imageUrl: campaign.productImageUrl,
          }
        : null,
    );
    setCampaignCaptions(captionsForCampaign(campaign));
    setError(null);
    selectTab("create");
  };

  const postImageUrls = (post: InstagramPostRow) => {
    const urls = [
      ...(post.image_urls || []),
      ...(post.image_url ? [post.image_url] : []),
    ]
      .map((url) => url.trim())
      .filter(Boolean);
    return Array.from(new Set(urls));
  };

  const attachedPhotosForPost = (
    post: InstagramPostRow,
  ): InstagramAttachedPhoto[] =>
    postImageUrls(post).map((url, index) => ({
      id: `history-${post.id}-${index}`,
      previewUrl: url,
      remoteUrl: url,
      uploading: false,
      error: null,
    }));

  const clearCurrentAttachedPhotoPreviews = () => {
    setAttachedPhotos((current) => {
      for (const photo of current) {
        if (photo.previewUrl.startsWith("blob:")) {
          URL.revokeObjectURL(photo.previewUrl);
        }
      }
      return [];
    });
  };

  const hydratePostForUse = (post: InstagramPostRow) => {
    const photos = attachedPhotosForPost(post);
    if (photos.length === 0) return;

    clearCurrentAttachedPhotoPreviews();
    setAttachedPhotos(photos);
    setPreviewUrl(photos[0].remoteUrl || null);
    setCaption(post.caption || "");
    setPrompt(post.prompt || "");
    setDraftPostId(post.status === "draft" ? post.id : null);
    setEditingScheduledPostId(null);
    setDestination("post");
    setCreateMode("single");
    setActiveCampaign(null);
    setSelectedProduct(null);
    setError(null);
    selectTab("create");
  };

  const hydratePostForEdit = (post: InstagramPostRow) => {
    const photos = attachedPhotosForPost(post);
    if (photos.length === 0) return;

    clearCurrentAttachedPhotoPreviews();
    setAttachedPhotos(photos);
    setPreviewUrl(null);
    setCaption("");
    setPrompt(post.prompt || "");
    setDraftPostId(null);
    setEditingScheduledPostId(null);
    setDestination("post");
    setCreateMode("single");
    setActiveCampaign(null);
    setSelectedProduct(null);
    setError(null);
    selectTab("create");
  };

  const hydrateScheduledPostForEdit = (post: InstagramPostRow) => {
    const photos = attachedPhotosForPost(post);
    if (photos.length === 0) return;

    clearCurrentAttachedPhotoPreviews();
    setAttachedPhotos(photos);
    setPreviewUrl(photos[0].remoteUrl || null);
    setCaption(post.caption || "");
    setPrompt(post.prompt || "");
    setDraftPostId(post.id);
    setEditingScheduledPostId(post.id);
    if (post.destination === "post" || post.destination === "story") {
      setDestination(post.destination);
    }
    if (post.aspect === "square" || post.aspect === "portrait") {
      setAspect(post.aspect);
    }
    setScheduleAtLocal(
      post.scheduled_at
        ? toMelbourneDateTimeLocal(new Date(post.scheduled_at))
        : defaultMelbourneScheduleLocal(),
    );
    setCreateMode("single");
    setActiveCampaign(null);
    setSelectedProduct(null);
    setError(null);
    selectTab("create");
  };

  const readyPublishUrls = () =>
    readyPhotoUrls.length > 0
      ? readyPhotoUrls
      : previewUrl
        ? [previewUrl]
        : [];

  const resetComposerAfterPost = () => {
    setDraftPostId(null);
    setEditingScheduledPostId(null);
    setPreviewUrl(null);
    setPrompt("");
    setCaption("");
    setScheduleAtLocal(defaultMelbourneScheduleLocal());
    setAttachedPhotos((current) => {
      for (const photo of current) {
        if (photo.previewUrl.startsWith("blob:")) {
          URL.revokeObjectURL(photo.previewUrl);
        }
      }
      return [];
    });
  };

  const handlePublish = async () => {
    const publishUrls = readyPublishUrls();
    if (publishUrls.length === 0) {
      setError("Generate or attach photos first.");
      return;
    }
    if (destination === "post" && !caption.trim()) {
      setError("Add a caption before publishing.");
      return;
    }
    try {
      setPublishing(true);
      setError(null);
      const res = await fetch("/api/store/instagram/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageUrl: publishUrls[0],
          imageUrls: publishUrls,
          caption,
          prompt,
          postId: draftPostId,
          destination: publishUrls.length > 1 ? "post" : destination,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Publish failed.");
      }
      resetComposerAfterPost();
      await loadPosts();
      selectTab("history");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Publish failed.");
    } finally {
      setPublishing(false);
    }
  };

  const handleSchedulePost = async () => {
    const publishUrls = readyPublishUrls();
    if (publishUrls.length === 0) {
      setError("Generate or attach photos first.");
      return;
    }
    if (destination === "post" && !caption.trim()) {
      setError("Add a caption before scheduling.");
      return;
    }

    let scheduledAtIso: string;
    try {
      scheduledAtIso = melbourneLocalDateTimeToIso(scheduleAtLocal);
    } catch {
      setError("Choose a valid Melbourne date and time.");
      return;
    }
    if (new Date(scheduledAtIso).getTime() <= Date.now() + 60_000) {
      setError("Choose a time at least one minute in the future (Melbourne time).");
      return;
    }

    try {
      setSchedulingPost(true);
      setError(null);
      const res = await fetch("/api/store/instagram/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageUrl: publishUrls[0],
          imageUrls: publishUrls,
          caption,
          prompt,
          postId: draftPostId,
          destination: publishUrls.length > 1 ? "post" : destination,
          aspect,
          scheduledAt: scheduledAtIso,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Could not schedule post.");
      }
      resetComposerAfterPost();
      await loadPosts();
      selectTab("schedule");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not schedule post.");
    } finally {
      setSchedulingPost(false);
    }
  };

  const handleDeleteScheduledPost = async (postId: string) => {
    try {
      setDeletingPostId(postId);
      setError(null);
      const res = await fetch(`/api/store/instagram/posts/${postId}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Could not delete scheduled post.");
      }
      if (editingScheduledPostId === postId) {
        resetComposerAfterPost();
      }
      await loadPosts();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not delete scheduled post.",
      );
    } finally {
      setDeletingPostId(null);
      setDeleteConfirmPostId(null);
    }
  };

  const formatBadges = (
    <InstagramFormatBadges
      destination={destination}
      aspect={aspect}
      includeLogo={includeLogo}
      logoUrl={storeLogoUrl}
      productName={selectedProduct?.name}
      productImageUrl={selectedProduct?.imageUrl}
      disabled={generating || publishing || uploadingPhotos}
      onDestinationChange={(value) => {
        if (value === "story" && attachedPhotos.length > 1) {
          setError("Carousels are feed posts only. Remove photos to use Story.");
          return;
        }
        setDestination(value);
      }}
      onAspectChange={setAspect}
      onIncludeLogoChange={setIncludeLogo}
      onOpenProductPicker={() => setProductPickerOpen(true)}
      onClearProduct={() => setSelectedProduct(null)}
    />
  );

  // Temporarily hide Create-tab Single/Campaign switcher; force single-post creation.
  // Flip to true to re-enable campaign creation in the Create tab.
  const SHOW_CREATE_MODE_TOGGLE = false;
  const createModeToggle = SHOW_CREATE_MODE_TOGGLE ? (
    <div className="flex w-fit items-center rounded-2xl bg-gray-100 p-0.5">
      <button
        type="button"
        onClick={() => setCreateMode("single")}
        className={cn(
          "flex items-center gap-1 rounded-2xl px-2.5 py-1 text-[11px] font-medium transition-colors",
          createMode === "single"
            ? "bg-white text-gray-800 shadow-sm"
            : "text-gray-600 hover:bg-gray-200/70",
        )}
      >
        <Sparkles className="h-3 w-3" />
        Single post
      </button>
      <button
        type="button"
        onClick={() => {
          setCreateMode("campaign");
          setDestination("post");
        }}
        className={cn(
          "flex items-center gap-1 rounded-2xl px-2.5 py-1 text-[11px] font-medium transition-colors",
          createMode === "campaign"
            ? "bg-white text-gray-800 shadow-sm"
            : "text-gray-600 hover:bg-gray-200/70",
        )}
      >
        <Megaphone className="h-3 w-3" />
        Campaign
      </button>
    </div>
  ) : null;

  const connected = Boolean(status?.connected);
  const accountLabel =
    status?.username?.trim()
      ? `@${status.username.replace(/^@/, "")}`
      : status?.accountName?.trim() || "Instagram";

  if (loading && !status) {
    return (
      <div
        className={cn(
          "flex h-[calc(100svh-57px)] items-center justify-center",
          PAGE_BG,
        )}
        aria-busy="true"
        aria-label="Loading Instagram"
      >
        <div className="space-y-4 text-center">
          <div className="mx-auto h-10 w-56 animate-pulse rounded-md bg-gray-100" />
          <div className="mx-auto h-12 w-full max-w-xl animate-pulse rounded-md bg-gray-100" />
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "relative flex h-[calc(100svh-57px)] min-w-0 flex-col overflow-hidden",
        PAGE_BG,
      )}
    >
      <InstagramProductPickerDialog
        open={productPickerOpen}
        onOpenChange={setProductPickerOpen}
        selectedProductId={selectedProduct?.id}
        onSelect={setSelectedProduct}
        onClear={() => setSelectedProduct(null)}
      />

      {/* Account control — top left */}
      <div className="absolute left-3 top-3 z-40 sm:left-4">
        {connected ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex items-center gap-1.5 rounded-2xl border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-800 shadow-sm transition-colors hover:bg-gray-50 data-[state=open]:bg-gray-50"
              >
                <InstagramLogo className="size-[15px] shrink-0" />
                <span className="max-w-[10rem] truncate">{accountLabel}</span>
                <ChevronDown className="h-4 w-4 text-gray-400" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              className="min-w-[10rem] rounded-2xl border border-gray-200 bg-white text-gray-800 shadow-sm"
            >
              <DropdownMenuItem
                disabled={disconnecting}
                onSelect={() => {
                  void handleDisconnect();
                }}
                className="cursor-pointer rounded-md text-sm focus:bg-gray-100"
              >
                {disconnecting ? "Disconnecting…" : "Disconnect"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <button
            type="button"
            onClick={() => void handleConnect()}
            disabled={connecting || status?.oauthConfigured === false}
            className="flex items-center gap-1.5 rounded-2xl border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-800 shadow-sm transition-colors hover:bg-gray-50 disabled:opacity-50"
          >
            {connecting ? (
              <Loader2 className="size-[15px] animate-spin" />
            ) : (
              <InstagramLogo className="size-[15px]" />
            )}
            Connect
          </button>
        )}
      </div>

      {/* Sliding tabs — top centre */}
      <div className="absolute left-1/2 top-3 z-40 -translate-x-1/2">
        <SlidingNavTabs
          items={TAB_ITEMS}
          value={selectedTab}
          onChange={selectTab}
          layoutId="instagram-workspace-tabs"
        />
      </div>

      <div
        role="tabpanel"
        className="flex min-h-0 flex-1 flex-col overflow-hidden"
        aria-label={TAB_ITEMS.find((item) => item.id === selectedTab)?.label}
      >
        <AnimatePresence mode="wait">
          {selectedTab === "create" ? (
            <motion.div
              key="create"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
              className="flex min-h-0 flex-1 flex-col overflow-y-auto"
            >
              <div
                className={cn(
                  "mx-auto flex w-full flex-1 flex-col items-center gap-6 px-6 py-16 sm:py-14",
                  previewUrl || activeCampaign ? "max-w-5xl" : "max-w-2xl",
                  activeCampaign ? "justify-start" : "justify-center",
                )}
              >
                {error && (
                  <div
                    role="alert"
                    className="w-full rounded-md border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700 shadow-sm"
                  >
                    {error}
                  </div>
                )}

                {!connected ? (
                  <div className="w-full rounded-md border border-gray-200 bg-white p-5 text-center shadow-sm">
                    <p className="text-sm text-gray-600">
                      Connect Instagram to create and publish posts from Yellow
                      Jersey.
                    </p>
                    <Button
                      type="button"
                      onClick={() => void handleConnect()}
                      disabled={connecting || status?.oauthConfigured === false}
                      className="mt-4 rounded-md bg-gray-900 px-5 text-white hover:bg-gray-800"
                    >
                      {connecting ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <InstagramLogo className="mr-2 h-4 w-4" />
                      )}
                      Connect Instagram
                    </Button>
                  </div>
                ) : campaignPlanning ? (
                  <div className="w-full space-y-6">
                    <div className="text-center">
                      <h1 className="text-xl font-medium tracking-tight text-gray-800 sm:text-[1.375rem]">
                        Planning your story
                      </h1>
                      <p className="mx-auto mt-2 max-w-lg text-sm text-gray-500">
                        Building the visual direction and day-by-day narrative
                        before creating the images.
                      </p>
                    </div>
                    <BuildingImagePanel
                      format={resolveInstagramFormat({
                        destination: "post",
                        aspect,
                      })}
                    />
                  </div>
                ) : activeCampaign ? (
                  <InstagramCampaignReview
                    campaign={activeCampaign}
                    captions={campaignCaptions}
                    generatingDay={campaignGeneratingDay}
                    scheduling={campaignScheduling}
                    onCaptionChange={(dayIndex, nextCaption) =>
                      setCampaignCaptions((current) => ({
                        ...current,
                        [dayIndex]: nextCaption,
                      }))
                    }
                    onRegenerateDay={(dayIndex) =>
                      void handleRegenerateCampaignDay(dayIndex)
                    }
                    onStartOver={() =>
                      void handleCancelCampaign(activeCampaign.id)
                    }
                    onSchedule={() => void handleScheduleCampaign()}
                  />
                ) : createMode === "campaign" ? (
                  <div className="w-full space-y-6">
                    <div className="text-center">
                      <InstagramLogo className="mx-auto h-12 w-12" />
                      <h1 className="mt-4 text-xl font-medium tracking-tight text-gray-800 sm:text-[1.375rem]">
                        What story should we tell?
                      </h1>
                      <p className="mx-auto mt-2 max-w-lg text-sm text-gray-500">
                        Set one objective. We will create a connected series of
                        daily feed posts for you to review before scheduling.
                      </p>
                    </div>
                    <InstagramCampaignComposer
                      objective={campaignObjective}
                      durationDays={campaignDuration}
                      aspect={aspect}
                      includeLogo={includeLogo}
                      logoUrl={storeLogoUrl}
                      productName={selectedProduct?.name}
                      productImageUrl={selectedProduct?.imageUrl}
                      startAt={campaignStartAt}
                      disabled={campaignPlanning}
                      onObjectiveChange={setCampaignObjective}
                      onDurationChange={setCampaignDuration}
                      onAspectChange={setAspect}
                      onIncludeLogoChange={setIncludeLogo}
                      onOpenProductPicker={() => setProductPickerOpen(true)}
                      onClearProduct={() => setSelectedProduct(null)}
                      onStartAtChange={setCampaignStartAt}
                      onSubmit={() => void handleBuildCampaign()}
                      belowInput={createModeToggle}
                    />
                  </div>
                ) : (
                  <div className="flex w-full min-w-0 flex-col gap-4">
                    <div className="text-center">
                      {!generating && !previewUrl ? (
                        <InstagramLogo className="mx-auto h-12 w-12" />
                      ) : null}
                      <h1
                        className={cn(
                          "text-xl font-medium tracking-tight text-gray-800 sm:text-[1.375rem]",
                          !generating && !previewUrl && "mt-4",
                        )}
                      >
                        {generating
                          ? attachedPhotos.length > 0
                            ? includeLogo && !prompt.trim()
                              ? "Adding your logo"
                              : "Editing your photo"
                            : "Building your post"
                          : previewUrl
                            ? readyPhotoUrls.length > 1
                              ? "Create carousel caption"
                              : "Create caption"
                            : "What should we post?"}
                      </h1>
                      <p className="mx-auto mt-2 max-w-lg text-sm text-gray-500">
                        {generating
                          ? "This can take up to a minute."
                          : previewUrl
                            ? readyPhotoUrls.length > 1
                              ? "Edit the caption, check each slide, then publish the carousel."
                              : "Edit the caption on the left. Preview updates on the right."
                            : attachedPhotos.length > 0
                              ? "Describe the changes you want, then continue. Leave blank to use the photo as-is."
                              : "Describe an image, or attach photos."}
                      </p>
                    </div>

                    {generating ? (
                      <BuildingImagePanel format={selectedFormat} />
                    ) : null}

                    {!generating && !previewUrl ? (
                      <>
                        <InstagramPhotoStrip
                          photos={attachedPhotos}
                          disabled={uploadingPhotos || generating}
                          onRemove={handleRemoveAttachedPhoto}
                        />
                        <HomeV2ChatInput
                          value={prompt}
                          isRunning={uploadingPhotos}
                          onChange={setPrompt}
                          onSubmit={() => void handleGenerate()}
                          placeholder={
                            attachedPhotos.length > 0
                              ? includeLogo
                                ? "Describe changes (optional), then continue to apply your logo…"
                                : "Describe the changes you want AI to make…"
                              : destination === "story"
                                ? "Describe the Story image…"
                                : "Describe the Instagram image…"
                          }
                          showDisclaimer={false}
                          inputAccessory={formatBadges}
                          onFileSelected={(file) => void handleAttachPhoto(file)}
                          fileAccept="image/jpeg,image/png,image/webp,image/*"
                          fileButtonLabel="Add photos"
                          fileMultiple
                          canSubmitWithoutText={photosReady}
                        />
                        <div className="flex justify-center">
                          {createModeToggle}
                        </div>
                      </>
                    ) : null}

                    {!generating && previewUrl ? (
                      <div className="w-full space-y-5">
                        {readyPhotoUrls.length > 0 ? (
                          <InstagramPhotoStrip
                            photos={attachedPhotos}
                            disabled={publishing}
                            onRemove={handleRemoveAttachedPhoto}
                          />
                        ) : null}
                        <div className="grid w-full items-start gap-5 lg:grid-cols-2">
                          <div className="order-2 space-y-3 lg:order-1">
                            <label className="block">
                              <span className="mb-2 block text-sm font-medium text-gray-800">
                                Caption
                              </span>
                              <textarea
                                value={caption}
                                onChange={(e) => setCaption(e.target.value)}
                                disabled={publishing || schedulingPost}
                                rows={10}
                                placeholder="Write your Instagram caption…"
                                className="w-full resize-y rounded-md border border-gray-200 bg-white px-5 py-4 text-[15px] leading-relaxed text-gray-900 shadow-sm outline-none placeholder:text-gray-400 focus:border-gray-300 disabled:opacity-60"
                              />
                            </label>
                            <label className="flex w-full flex-wrap items-center gap-2 rounded-2xl border border-gray-200 bg-white px-3.5 py-2.5 shadow-sm">
                              <Calendar className="h-4 w-4 shrink-0 text-gray-500" />
                              <span className="text-xs font-medium text-gray-600">
                                Melbourne time
                              </span>
                              <input
                                type="datetime-local"
                                value={scheduleAtLocal}
                                disabled={publishing || schedulingPost}
                                onChange={(event) =>
                                  setScheduleAtLocal(event.target.value)
                                }
                                className="min-w-0 flex-1 bg-transparent text-sm text-gray-800 outline-none disabled:opacity-60"
                              />
                            </label>
                            <p className="text-[11px] text-gray-500">
                              Schedules in Australia/Melbourne
                              {(() => {
                                try {
                                  if (!scheduleAtLocal) return "";
                                  return ` · ${formatMelbourneTime(
                                    new Date(
                                      melbourneLocalDateTimeToIso(scheduleAtLocal),
                                    ),
                                  )}`;
                                } catch {
                                  return "";
                                }
                              })()}
                            </p>
                            <div className="flex flex-wrap items-center gap-2">
                              <Button
                                type="button"
                                variant="outline"
                                size="default"
                                disabled={publishing || schedulingPost}
                                onClick={() => {
                                  setPreviewUrl(null);
                                  setDraftPostId(null);
                                  setEditingScheduledPostId(null);
                                  setCaption("");
                                  setAttachedPhotos((current) => {
                                    for (const photo of current) {
                                      if (photo.previewUrl.startsWith("blob:")) {
                                        URL.revokeObjectURL(photo.previewUrl);
                                      }
                                    }
                                    return [];
                                  });
                                }}
                                className="rounded-2xl border-gray-200 bg-white px-3.5 text-gray-700 shadow-sm hover:bg-gray-50"
                              >
                                Start over
                              </Button>
                              {readyPhotoUrls.length === 0 ? (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="default"
                                  disabled={publishing || schedulingPost}
                                  onClick={() => void handleGenerate()}
                                  className="rounded-2xl border-gray-200 bg-white px-3.5 text-gray-700 shadow-sm hover:bg-gray-50"
                                >
                                  Regenerate
                                </Button>
                              ) : null}
                              <Button
                                type="button"
                                variant="outline"
                                size="default"
                                disabled={
                                  publishing ||
                                  schedulingPost ||
                                  (destination === "post" && !caption.trim()) ||
                                  (readyPhotoUrls.length > 0 && !photosReady)
                                }
                                onClick={() => void handleSchedulePost()}
                                className="rounded-2xl border-gray-200 bg-white px-3.5 text-gray-700 shadow-sm hover:bg-gray-50"
                              >
                                {schedulingPost ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Calendar className="h-4 w-4" />
                                )}
                                {schedulingPost ? "Scheduling…" : editingScheduledPostId ? "Save schedule" : "Schedule post"}
                              </Button>
                              <Button
                                type="button"
                                size="default"
                                disabled={
                                  publishing ||
                                  schedulingPost ||
                                  (destination === "post" && !caption.trim()) ||
                                  (readyPhotoUrls.length > 0 && !photosReady)
                                }
                                onClick={() => void handlePublish()}
                                className="rounded-2xl bg-gray-900 px-3.5 text-white hover:bg-gray-800"
                              >
                                {publishing ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : null}
                                {publishing
                                  ? "Publishing…"
                                  : readyPhotoUrls.length > 1
                                    ? "Publish carousel"
                                    : destination === "story"
                                      ? "Publish story"
                                      : "Publish now"}
                              </Button>
                            </div>
                          </div>

                          <div className="order-1 lg:order-2">
                            <InstagramPostPreview
                              imageUrl={previewUrl}
                              imageUrls={
                                readyPhotoUrls.length > 0
                                  ? readyPhotoUrls
                                  : previewUrl
                                    ? [previewUrl]
                                    : []
                              }
                              caption={caption}
                              username={accountLabel}
                              destination={
                                readyPhotoUrls.length > 1 ? "post" : destination
                              }
                              aspect={aspect}
                            />
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            </motion.div>
          ) : null}

          {selectedTab === "schedule" ? (
            <motion.div
              key="schedule"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
              className="flex min-h-0 flex-1 flex-col overflow-y-auto"
            >
              <div className="mx-auto w-full max-w-4xl px-4 pb-10 pt-20 sm:px-6">
                <div className="text-center">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-md bg-white shadow-sm">
                    <CalendarClock className="h-6 w-6 text-gray-800" />
                  </div>
                  <h1 className="mt-4 text-xl font-medium tracking-tight text-gray-800 sm:text-[1.375rem]">
                    Scheduled posts
                  </h1>
                  <p className="mx-auto mt-2 max-w-lg text-sm text-gray-500">
                    Posts queued to publish automatically at the Melbourne time
                    you chose.
                  </p>
                </div>

                {error && (
                  <div
                    role="alert"
                    className="mt-6 rounded-md border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700 shadow-sm"
                  >
                    {error}
                  </div>
                )}

                {scheduledPosts.length === 0 ? (
                  <div className="mt-6 rounded-2xl border border-gray-200 bg-white px-5 py-10 text-center shadow-sm">
                    <p className="text-sm text-gray-600">
                      No posts scheduled yet.
                    </p>
                    <button
                      type="button"
                      onClick={() => selectTab("create")}
                      className="mt-4 rounded-md border border-gray-200 bg-white px-3.5 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50"
                    >
                      Create a post
                    </button>
                  </div>
                ) : (
                  <ul className="mt-6 space-y-3">
                    {scheduledPosts.map((post) => {
                      const imageUrls = postImageUrls(post);
                      const primaryImageUrl = imageUrls[0] || null;

                      return (
                        <li
                          key={post.id}
                          className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5"
                        >
                          <div className="flex min-w-0 items-start gap-4">
                            <div className="h-16 w-16 shrink-0 overflow-hidden rounded-md bg-gray-100 sm:h-20 sm:w-20">
                              {primaryImageUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={primaryImageUrl}
                                  alt=""
                                  className="h-full w-full object-cover"
                                />
                              ) : (
                                <div className="flex h-full items-center justify-center text-[11px] text-gray-400">
                                  No image
                                </div>
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="rounded-md bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
                                  Scheduled
                                </span>
                                <span className="rounded-md bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                                  {postTypeLabel(post, imageUrls.length)}
                                </span>
                              </div>
                              <p className="mt-2 line-clamp-2 text-sm text-gray-800">
                                {post.caption || post.prompt || "Untitled post"}
                              </p>
                              <p className="mt-1.5 flex items-center gap-1.5 text-xs text-gray-500">
                                <Calendar className="h-3.5 w-3.5 shrink-0" />
                                {formatWhen(post.scheduled_at)}
                              </p>
                            </div>
                            <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
                              <button
                                type="button"
                                disabled={!primaryImageUrl}
                                onClick={() => hydrateScheduledPostForEdit(post)}
                                className="inline-flex items-center justify-center gap-1.5 rounded-2xl border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                                Edit
                              </button>
                              <button
                                type="button"
                                disabled={deletingPostId === post.id}
                                onClick={() => setDeleteConfirmPostId(post.id)}
                                className="inline-flex items-center justify-center gap-1.5 rounded-2xl border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
                              >
                                {deletingPostId === post.id ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <Trash2 className="h-3.5 w-3.5" />
                                )}
                                Delete
                              </button>
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </motion.div>
          ) : null}

          {selectedTab === "history" ? (
            <motion.div
              key="history"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
              className="min-h-0 flex-1 overflow-y-auto px-4 pb-8 pt-16 md:px-6"
            >
              <div className="mx-auto w-full max-w-3xl">
                <div className="mb-5 text-center sm:text-left">
                  <h1 className="text-xl font-medium tracking-tight text-gray-800">
                    Post history
                  </h1>
                  <p className="mt-1 text-sm text-gray-500">
                    Drafts, scheduled, and published posts from this store.
                  </p>
                </div>

                {posts.length === 0 ? (
                  <div className="rounded-md border border-gray-200 bg-white px-5 py-10 text-center shadow-sm">
                    <History className="mx-auto h-8 w-8 text-gray-300" />
                    <p className="mt-3 text-sm text-gray-600">No posts yet.</p>
                    <button
                      type="button"
                      onClick={() => selectTab("create")}
                      className="mt-4 rounded-md border border-gray-200 bg-white px-3.5 py-1.5 text-xs font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50"
                    >
                      Create your first post
                    </button>
                  </div>
                ) : (
                  <ul className="grid gap-3 sm:grid-cols-2">
                    {posts.map((post) => {
                      const availableImageUrls = postImageUrls(post);
                      const primaryImageUrl = availableImageUrls[0] || null;

                      return (
                        <li
                          key={post.id}
                          className="overflow-hidden rounded-md border border-gray-200 bg-white shadow-sm"
                        >
                          <div className="relative aspect-square bg-gray-50">
                            {primaryImageUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={primaryImageUrl}
                                alt=""
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <div className="flex h-full items-center justify-center text-xs text-gray-400">
                                Image not generated
                              </div>
                            )}
                          </div>
                          <div className="space-y-2 p-3.5">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="rounded-md bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
                                {statusLabel(post.status)}
                              </span>
                              <span className="text-xs text-gray-500">
                                {formatWhen(
                                  post.posted_at ||
                                    post.scheduled_at ||
                                    post.created_at,
                                )}
                              </span>
                            </div>
                            {post.campaign_id ? (
                              <p className="text-xs font-medium text-gray-500">
                                Campaign day {post.day_index}:{" "}
                                {campaigns.find(
                                  (campaign) => campaign.id === post.campaign_id,
                                )?.objective || "Campaign"}
                              </p>
                            ) : null}
                            <p className="line-clamp-2 text-sm text-gray-800">
                              {post.caption || post.prompt || "Untitled"}
                            </p>
                            {post.error_message ? (
                              <p className="text-xs text-gray-500">
                                {post.error_message}
                              </p>
                            ) : null}
                            {post.permalink ? (
                              <a
                                href={post.permalink}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-xs font-medium text-gray-700 hover:text-gray-900"
                              >
                                View on Instagram
                                <ExternalLink className="h-3 w-3" />
                              </a>
                            ) : null}
                            <div className="flex items-center gap-2 pt-1">
                              <Button
                                type="button"
                                variant="outline"
                                disabled={!primaryImageUrl}
                                onClick={() => hydratePostForEdit(post)}
                                className="rounded-2xl border-gray-200 bg-white px-3.5 text-gray-700 shadow-sm hover:bg-gray-50"
                              >
                                Edit
                              </Button>
                              <Button
                                type="button"
                                disabled={!primaryImageUrl}
                                onClick={() => hydratePostForUse(post)}
                                className="rounded-2xl bg-gray-900 px-3.5 text-white hover:bg-gray-800"
                              >
                                Use
                              </Button>
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      <AlertDialog
        open={Boolean(deleteConfirmPostId)}
        onOpenChange={(open) => {
          if (!open) setDeleteConfirmPostId(null);
        }}
      >
        <AlertDialogContent className="rounded-md border border-gray-200 bg-white animate-in slide-in-from-bottom-4 zoom-in-95 duration-300 ease-out sm:max-w-md">
          <AlertDialogHeader className="text-left">
            <AlertDialogTitle>Remove scheduled post?</AlertDialogTitle>
            <AlertDialogDescription>
              This post will be removed from your schedule and deleted. This
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-md">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-md bg-gray-900 text-white hover:bg-gray-800"
              disabled={Boolean(deletingPostId)}
              onClick={(event) => {
                event.preventDefault();
                if (deleteConfirmPostId) {
                  void handleDeleteScheduledPost(deleteConfirmPostId);
                }
              }}
            >
              {deletingPostId ? "Deleting…" : "Delete post"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
