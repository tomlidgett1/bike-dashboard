"use client";

/**
 * Store Homepage Manager
 *
 * The owner-facing editor for the public Home (landing) tab. It loads the
 * store's own profile, resolves the saved homepage_config into a fully
 * concrete config (so every control has a real value), and lets the owner
 * customise the hero, highlights, collections, story, services, gallery and
 * visit sections — with a live preview rendered by the very same component
 * that powers the public page (<StoreHomeTab>).
 *
 * Saves the whole config to PUT /api/store/homepage (debounced auto-save).
 * Images upload to POST /api/store/homepage/upload.
 */

import * as React from "react";
import { Reorder } from "framer-motion";
import {
  Loader2,
  ExternalLink,
  Plus,
  Trash2,
  GripVertical,
  X,
  Upload,
  RotateCcw,
  Check,
  AlertTriangle,
  Home,
  Palette,
  Image as ImageIcon,
  Megaphone,
  Sparkles,
  LayoutGrid,
  BookOpen,
  Wrench,
  Images,
  MapPin,
  ListOrdered,
  LayoutList,
  GalleryHorizontal,
} from "@/components/layout/app-sidebar/dashboard-icons";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SettingsRow } from "@/components/dashboard";
import {
  DashboardFloatingPage,
} from "@/components/layout/dashboard-floating-page";
import { useAuth } from "@/components/providers/auth-provider";
import { StoreHomeTab } from "@/components/marketplace/store-profile/store-home-tab";
import {
  resolveHomepageConfig,
  BRAND_YELLOW,
  DEFAULT_WEEKLY_SPECIALS_BANNER,
} from "@/lib/marketplace/homepage-config";
import {
  HOMEPAGE_ICON_KEYS,
  getHomepageIcon,
} from "@/components/marketplace/store-profile/homepage-icons";
import type {
  StoreProfile,
  StoreHomepageConfig,
  HomeHighlight,
  HomeCollection,
  HomeGalleryImage,
  HomeSectionKey,
  HomeCta,
  HomeBanner,
  HeroVariant,
} from "@/lib/types/store";

// ── Static option tables ───────────────────────────────────
const SECTION_LABELS: Record<HomeSectionKey, string> = {
  highlights: "Highlights",
  collections: "Collections",
  carousel_1: "Carousel 1",
  carousel_2: "Carousel 2",
  story: "Our story",
  services: "Services",
  gallery: "Gallery",
  visit: "Visit us",
};

function homeSectionLabel(
  key: HomeSectionKey,
  config: StoreHomepageConfig,
  store: StoreProfile | null,
): string {
  if (key === "carousel_1" || key === "carousel_2") {
    const slotId = key === "carousel_1" ? config.featured_carousels.slot1 : config.featured_carousels.slot2;
    const category = slotId ? store?.categories.find((c) => c.id === slotId) : undefined;
    if (category) return `Carousel: ${category.name}`;
    return key === "carousel_1" ? "Carousel 1" : "Carousel 2";
  }
  return SECTION_LABELS[key];
}

type EditorTabId =
  | "theme"
  | "hero"
  | "announcement"
  | "banners"
  | "highlights"
  | "collections"
  | "story"
  | "services"
  | "gallery"
  | "visit"
  | "carousels"
  | "layout";

const EDITOR_TABS: {
  id: EditorTabId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { id: "theme", label: "Theme", icon: Palette },
  { id: "hero", label: "Hero", icon: ImageIcon },
  { id: "announcement", label: "Announcement", icon: Megaphone },
  { id: "banners", label: "Banners", icon: LayoutList },
  { id: "highlights", label: "Highlights", icon: Sparkles },
  { id: "collections", label: "Collections", icon: LayoutGrid },
  { id: "story", label: "Story", icon: BookOpen },
  { id: "services", label: "Services", icon: Wrench },
  { id: "gallery", label: "Gallery", icon: Images },
  { id: "visit", label: "Visit", icon: MapPin },
  { id: "carousels", label: "Carousels", icon: GalleryHorizontal },
  { id: "layout", label: "Layout", icon: ListOrdered },
];

const CTA_KNOWN = ["products", "service", "rentals", "about", "call", "directions"];
const CTA_OPTIONS: { value: string; label: string }[] = [
  { value: "products", label: "Open Products tab" },
  { value: "service", label: "Open Service tab" },
  { value: "rentals", label: "Open Rentals tab" },
  { value: "about", label: "Open About tab" },
  { value: "call", label: "Call the store" },
  { value: "directions", label: "Get directions" },
  { value: "custom", label: "Custom link…" },
];
const BANNER_HREF_KNOWN = ["weekly_specials", ...CTA_KNOWN];
const BANNER_HREF_OPTIONS: { value: string; label: string }[] = [
  { value: "weekly_specials", label: "Open weekly specials swipe" },
  ...CTA_OPTIONS.filter((o) => o.value !== "custom"),
  { value: "custom", label: "Custom link…" },
];

// ── Image upload helper ────────────────────────────────────
async function uploadHomepageImage(file: File, slot: string): Promise<string> {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("slot", slot);
  const res = await fetch("/api/store/homepage/upload", { method: "POST", body: fd });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || "Upload failed");
  return data.url as string;
}

function uid(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
}

const AUTO_SAVE_DELAY_MS = 800;

// ============================================================
// Main component
// ============================================================
export function StoreHomepageManager() {
  const { user } = useAuth();
  const [store, setStore] = React.useState<StoreProfile | null>(null);
  const [config, setConfig] = React.useState<StoreHomepageConfig | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [migrated, setMigrated] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const [savedAt, setSavedAt] = React.useState<number | null>(null);
  const [showPreview, setShowPreview] = React.useState(true);
  const [activeTab, setActiveTab] = React.useState<EditorTabId>("hero");

  const configRef = React.useRef<StoreHomepageConfig | null>(null);
  const savedSnapshotRef = React.useRef<string | null>(null);
  const saveTimerRef = React.useRef<number | null>(null);
  const saveAgainRef = React.useRef(false);

  configRef.current = config;

  const persistConfig = React.useCallback(async (configToSave: StoreHomepageConfig) => {
    const snapshot = JSON.stringify(configToSave);
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch("/api/store/homepage", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config: configToSave }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 503) setMigrated(false);
        throw new Error(data?.error || "Failed to save");
      }
      savedSnapshotRef.current = snapshot;
      setSavedAt(Date.now());
      window.setTimeout(() => setSavedAt(null), 2500);

      const latest = configRef.current;
      if (latest && JSON.stringify(latest) !== snapshot) {
        saveAgainRef.current = true;
      }
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
      if (saveAgainRef.current) {
        saveAgainRef.current = false;
        const latest = configRef.current;
        if (latest && migrated) {
          if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
          saveTimerRef.current = window.setTimeout(() => {
            void persistConfig(latest);
          }, AUTO_SAVE_DELAY_MS);
        }
      }
    }
  }, [migrated]);

  const scheduleAutoSave = React.useCallback(() => {
    if (!migrated || !configRef.current) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      const latest = configRef.current;
      if (!latest) return;
      void persistConfig(latest);
    }, AUTO_SAVE_DELAY_MS);
  }, [migrated, persistConfig]);

  const load = React.useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    setLoadError(null);
    try {
      const [storeRes, cfgRes] = await Promise.all([
        fetch(`/api/marketplace/store/${user.id}`),
        fetch("/api/store/homepage"),
      ]);
      if (!storeRes.ok) throw new Error("Could not load your store profile");
      const storeData = await storeRes.json();
      const profile: StoreProfile = storeData.store;

      let raw: Partial<StoreHomepageConfig> = profile.homepage_config ?? {};
      if (cfgRes.ok) {
        const cfgData = await cfgRes.json();
        raw = cfgData.config ?? raw;
        setMigrated(cfgData.migrated !== false);
      }
      setStore(profile);
      const resolved = resolveHomepageConfig(raw, profile);
      setConfig(resolved);
      savedSnapshotRef.current = JSON.stringify(resolved);
    } catch (err) {
      console.error("Homepage manager load failed:", err);
      setLoadError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  React.useEffect(() => {
    load();
  }, [load]);

  React.useEffect(() => {
    if (loading || !config || !migrated) return;
    const snapshot = JSON.stringify(config);
    if (savedSnapshotRef.current === snapshot) return;
    scheduleAutoSave();
  }, [config, loading, migrated, scheduleAutoSave]);

  React.useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  const resetToDefaults = () => {
    if (store) setConfig(resolveHomepageConfig({}, store));
  };

  // ── Section-scoped updaters ──────────────────────────────
  type C = StoreHomepageConfig;
  const setEnabled = (v: boolean) => setConfig((c) => (c ? { ...c, enabled: v } : c));
  const setAccent = (accent: string) => setConfig((c) => (c ? { ...c, theme: { accent } } : c));
  const setSectionOrder = (order: HomeSectionKey[]) =>
    setConfig((c) => (c ? { ...c, section_order: order } : c));
  const patchHero = (p: Partial<C["hero"]>) =>
    setConfig((c) => (c ? { ...c, hero: { ...c.hero, ...p } } : c));
  const patchAnn = (p: Partial<C["announcement"]>) =>
    setConfig((c) => (c ? { ...c, announcement: { ...c.announcement, ...p } } : c));
  const patchBanners = (p: Partial<C["banners"]>) =>
    setConfig((c) => (c ? { ...c, banners: { ...c.banners, ...p } } : c));
  const patchHi = (p: Partial<C["highlights"]>) =>
    setConfig((c) => (c ? { ...c, highlights: { ...c.highlights, ...p } } : c));
  const patchCol = (p: Partial<C["collections"]>) =>
    setConfig((c) => (c ? { ...c, collections: { ...c.collections, ...p } } : c));
  const patchStory = (p: Partial<C["story"]>) =>
    setConfig((c) => (c ? { ...c, story: { ...c.story, ...p } } : c));
  const patchGal = (p: Partial<C["gallery"]>) =>
    setConfig((c) => (c ? { ...c, gallery: { ...c.gallery, ...p } } : c));
  const patchSvc = (p: Partial<C["services"]>) =>
    setConfig((c) => (c ? { ...c, services: { ...c.services, ...p } } : c));
  const patchVisit = (p: Partial<C["visit"]>) =>
    setConfig((c) => (c ? { ...c, visit: { ...c.visit, ...p } } : c));
  const patchFeaturedCarousels = (p: Partial<C["featured_carousels"]>) =>
    setConfig((c) => (c ? { ...c, featured_carousels: { ...c.featured_carousels, ...p } } : c));
  const patchBadges = (p: Partial<C["badges"]>) =>
    setConfig((c) => (c ? { ...c, badges: { ...c.badges, ...p } } : c));

  const previewStore = React.useMemo<StoreProfile | null>(
    () => (store && config ? { ...store, homepage_config: config } : null),
    [store, config],
  );

  const headerActions =
    config && store ? (
      <div className="flex flex-wrap items-center justify-end gap-2">
        {migrated ? (
          <span className="inline-flex min-w-[92px] items-center gap-1.5 text-sm text-muted-foreground">
            {saving ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Saving…
              </>
            ) : savedAt ? (
              <>
                <Check className="h-3.5 w-3.5 text-muted-foreground" />
                Saved
              </>
            ) : null}
          </span>
        ) : null}
        <label className="flex cursor-pointer items-center gap-2">
          <Switch checked={config.enabled} onCheckedChange={setEnabled} />
          <span className="text-sm font-medium text-foreground">
            {config.enabled ? "Home tab is on" : "Home tab is off"}
          </span>
        </label>
        <Button asChild variant="outline" size="sm" className="gap-1.5 rounded-md">
          <a href={`/marketplace/store/${user?.id}`} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="h-3.5 w-3.5" /> View live
          </a>
        </Button>
      </div>
    ) : undefined;

  if (loading) {
    return (
      <DashboardFloatingPage title="Landing page" icon={Home} flush>
        <div className="flex flex-1 items-center justify-center p-16">
          <Loader2 className="h-7 w-7 text-muted-foreground animate-spin" />
        </div>
      </DashboardFloatingPage>
    );
  }

  if (loadError || !config || !store) {
    return (
      <DashboardFloatingPage title="Landing page" icon={Home} flush>
        <div className="flex flex-1 items-center justify-center p-6">
          <div className="max-w-sm rounded-md border border-destructive/30 bg-white p-6 text-center">
            <AlertTriangle className="h-6 w-6 text-destructive mx-auto mb-2" />
            <p className="text-sm text-foreground font-medium">{loadError || "Couldn't load your home page settings"}</p>
            <Button variant="outline" size="sm" onClick={load} className="mt-4 rounded-md">
              <RotateCcw className="h-3.5 w-3.5 mr-2" /> Try again
            </Button>
          </div>
        </div>
      </DashboardFloatingPage>
    );
  }

  return (
    <DashboardFloatingPage
      title="Landing page"
      icon={Home}
      flush
      actions={headerActions}
      description="Design the landing page customers see first on your storefront."
      toolbar={
        <div className="flex max-w-full flex-wrap items-center gap-0.5 rounded-md bg-gray-100 p-0.5 w-fit">
          {EDITOR_TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex shrink-0 items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
                  isActive
                    ? "bg-white text-gray-800 shadow-sm"
                    : "text-gray-600 hover:bg-gray-200/70",
                )}
              >
                <tab.icon className="h-3 w-3" />
                {tab.label}
              </button>
            );
          })}
        </div>
      }
    >
      <div className="space-y-6 p-4 md:p-5">
          {!migrated && (
            <div className="flex items-start gap-3 rounded-md border border-border bg-white px-4 py-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground" />
              <div className="text-sm text-muted-foreground">
                <p className="font-medium text-foreground">Saving isn&apos;t enabled yet</p>
                <p className="mt-0.5">
                  The database column for home pages hasn&apos;t been created. Run{" "}
                  <code className="rounded-md bg-muted px-1 py-0.5 text-xs">supabase db push</code>{" "}
                  to enable saving. You can still design your page below.
                </p>
              </div>
            </div>
          )}

          {saveError && (
            <div className="rounded-md border border-red-200 bg-white px-3 py-2 text-sm text-red-700">
              {saveError}
            </div>
          )}

      {activeTab === "theme" && (
      <EditorSection title="Theme" description="Accent colour used across buttons and highlights.">
        <div className="flex items-center gap-3">
          <input
            type="color"
            value={normalizeHex(config.theme.accent)}
            onChange={(e) => setAccent(e.target.value)}
            className="h-10 w-14 cursor-pointer rounded-md border border-input bg-transparent p-1"
            aria-label="Accent colour"
          />
          <Input
            value={config.theme.accent}
            onChange={(e) => setAccent(e.target.value)}
            className="w-40 font-mono"
            placeholder={BRAND_YELLOW}
          />
          <button
            type="button"
            onClick={() => setAccent(BRAND_YELLOW)}
            className="text-xs text-muted-foreground hover:text-foreground cursor-pointer"
          >
            Reset to Yellow Jersey
          </button>
        </div>
      </EditorSection>
      )}

      {activeTab === "hero" && (
      <EditorSection title="Hero" description="The first thing visitors see.">
        <Field label="Layout">
          <Segmented
            value={config.hero.variant}
            onChange={(v) => patchHero({ variant: v as HeroVariant })}
            options={[
              { value: "spotlight", label: "Spotlight" },
              { value: "split", label: "Split" },
              { value: "minimal", label: "Minimal" },
            ]}
          />
        </Field>
        <HeroImagesField
          value={config.hero.image_urls}
          onChange={(urls) => patchHero({ image_urls: urls, image_url: urls[0] ?? null })}
        />
        <TextField label="Headline" value={config.hero.headline} onChange={(v) => patchHero({ headline: v })} placeholder={store.store_name} />
        <TextAreaField label="Subheadline" value={config.hero.subheadline} onChange={(v) => patchHero({ subheadline: v })} rows={2} />

        <div className="space-y-4 rounded-md border border-gray-200 bg-white p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">Address line</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Shown below the subheadline at the same size. Leave blank to use your store address.
              </p>
            </div>
            <Switch
              checked={config.hero.contact.show_address}
              onCheckedChange={(show_address) => patchHero({ contact: { ...config.hero.contact, show_address } })}
              className="mt-0.5 flex-shrink-0"
            />
          </div>
          {config.hero.contact.show_address && (
            <TextField
              label="Address"
              value={config.hero.contact.address}
              onChange={(address) => patchHero({ contact: { ...config.hero.contact, address } })}
              placeholder={store.address || "277 High Street, Ashburton 3147"}
            />
          )}
        </div>

        <div className="space-y-4 rounded-md border border-gray-200 bg-white p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">Email line</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Shown below the address. Tapping opens the visitor&apos;s email app.
              </p>
            </div>
            <Switch
              checked={config.hero.contact.show_email}
              onCheckedChange={(show_email) =>
                patchHero({
                  contact: {
                    ...config.hero.contact,
                    show_email,
                    email:
                      show_email && !config.hero.contact.email
                        ? user?.email ?? ""
                        : config.hero.contact.email,
                  },
                })
              }
              className="mt-0.5 flex-shrink-0"
            />
          </div>
          {config.hero.contact.show_email && (
            <TextField
              label="Email"
              value={config.hero.contact.email}
              onChange={(email) => patchHero({ contact: { ...config.hero.contact, email } })}
              placeholder={user?.email || "hello@yourstore.com"}
            />
          )}
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Text alignment">
            <Segmented
              value={config.hero.align}
              onChange={(v) => patchHero({ align: v as "left" | "center" })}
              options={[
                { value: "left", label: "Left" },
                { value: "center", label: "Center" },
              ]}
            />
          </Field>
          <Field label={`Image overlay (${config.hero.overlay})`}>
            <input
              type="range"
              min={0}
              max={80}
              value={config.hero.overlay}
              onChange={(e) => patchHero({ overlay: Number(e.target.value) })}
              className="w-full accent-gray-900 cursor-pointer"
            />
          </Field>
        </div>
        <Field label="Primary button">
          <CtaRow cta={config.hero.primary_cta} onChange={(c) => patchHero({ primary_cta: c })} />
        </Field>
        <Field label="Secondary button">
          <div className="space-y-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <Switch
                checked={config.hero.secondary_cta != null}
                onCheckedChange={(v) =>
                  patchHero({ secondary_cta: v ? { label: "Learn more", href: "about" } : null })
                }
              />
              <span className="text-xs text-muted-foreground">Show a second button</span>
            </label>
            {config.hero.secondary_cta && (
              <CtaRow cta={config.hero.secondary_cta} onChange={(c) => patchHero({ secondary_cta: c })} />
            )}
          </div>
        </Field>
      </EditorSection>
      )}

      {activeTab === "announcement" && (
      <EditorSection
        title="Announcement bar"
        description="A thin strip above the hero — great for sales or notices."
        enabled={config.announcement.enabled}
        onEnabledChange={(v) => patchAnn({ enabled: v })}
      >
        <TextField
          label="Message"
          value={config.announcement.text}
          onChange={(v) => patchAnn({ text: v })}
          placeholder="Free local delivery on orders over $100"
        />
      </EditorSection>
      )}

      {activeTab === "banners" && (
      <EditorSection
        title="Banners"
        description="Promotional cards below the hero — weekly specials plus any custom banners you add."
        enabled={config.banners.enabled}
        onEnabledChange={(v) => patchBanners({ enabled: v })}
      >
        <Reorder.Group
          axis="y"
          values={config.banners.items}
          onReorder={(items) => patchBanners({ items })}
          className="divide-y divide-gray-100 rounded-md border border-gray-200 bg-white"
        >
          {config.banners.items.map((banner) => (
            <Reorder.Item key={banner.id} value={banner}>
              <BannerEditorRow
                banner={banner}
                onChange={(next) =>
                  patchBanners({
                    items: config.banners.items.map((b) => (b.id === banner.id ? next : b)),
                  })
                }
                onRemove={
                  banner.kind === "weekly_specials"
                    ? undefined
                    : () => patchBanners({ items: config.banners.items.filter((b) => b.id !== banner.id) })
                }
              />
            </Reorder.Item>
          ))}
        </Reorder.Group>

        {config.banners.items.length < 8 && (
          <AddButton
            label="Add banner"
            onClick={() =>
              patchBanners({
                items: [
                  ...config.banners.items,
                  {
                    id: uid(),
                    enabled: true,
                    kind: "custom",
                    title: "New banner",
                    subtitle: "",
                    footer_text: "",
                    image_url: null,
                    href: "products",
                  } satisfies HomeBanner,
                ],
              })
            }
          />
        )}

        {!config.banners.items.some((b) => b.kind === "weekly_specials") && (
          <AddButton
            label="Restore weekly specials banner"
            onClick={() =>
              patchBanners({
                items: [{ ...DEFAULT_WEEKLY_SPECIALS_BANNER, id: uid() }, ...config.banners.items],
              })
            }
          />
        )}
      </EditorSection>
      )}

      {activeTab === "highlights" && (
      <EditorSection
        title="Highlights"
        description="Short selling points shown as a row of cards."
        enabled={config.highlights.enabled}
        onEnabledChange={(v) => patchHi({ enabled: v })}
      >
        <Reorder.Group axis="y" values={config.highlights.items} onReorder={(items) => patchHi({ items })} className="divide-y divide-gray-100 rounded-md border border-gray-200 bg-white">
          {config.highlights.items.map((item) => (
            <Reorder.Item key={item.id} value={item}>
              <div className="flex items-start gap-2 px-3 py-2.5 transition-colors hover:bg-gray-50">
                <GripVertical className="mt-2 h-4 w-4 flex-shrink-0 cursor-grab text-gray-400 active:cursor-grabbing" />
                <div className="flex-1 space-y-2 min-w-0">
                  <IconPicker value={item.icon} onChange={(icon) => updateItem(config.highlights.items, item.id, { icon }, (items) => patchHi({ items }))} />
                  <Input
                    value={item.title}
                    onChange={(e) => updateItem(config.highlights.items, item.id, { title: e.target.value }, (items) => patchHi({ items }))}
                    placeholder="Title"
                  />
                  <Input
                    value={item.description}
                    onChange={(e) => updateItem(config.highlights.items, item.id, { description: e.target.value }, (items) => patchHi({ items }))}
                    placeholder="One short sentence"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => patchHi({ items: config.highlights.items.filter((x) => x.id !== item.id) })}
                  className="text-muted-foreground hover:text-destructive p-1 cursor-pointer"
                  aria-label="Remove highlight"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </Reorder.Item>
          ))}
        </Reorder.Group>
        {config.highlights.items.length < 8 && (
          <AddButton
            label="Add highlight"
            onClick={() =>
              patchHi({
                items: [
                  ...config.highlights.items,
                  { id: uid(), icon: HOMEPAGE_ICON_KEYS[0], title: "New highlight", description: "" } as HomeHighlight,
                ],
              })
            }
          />
        )}
      </EditorSection>
      )}

      {activeTab === "collections" && (
      <EditorSection
        title="Collections"
        description="Visual tiles that link into your product categories."
        enabled={config.collections.enabled}
        onEnabledChange={(v) => patchCol({ enabled: v })}
      >
        <div className="grid sm:grid-cols-2 gap-4">
          <TextField label="Title" value={config.collections.title} onChange={(v) => patchCol({ title: v })} />
          <TextField label="Subtitle" value={config.collections.subtitle} onChange={(v) => patchCol({ subtitle: v })} />
        </div>
        <label className="flex items-center gap-2 cursor-pointer">
          <Switch
            checked={config.collections.auto}
            onCheckedChange={(v) =>
              patchCol(
                v
                  ? { auto: true }
                  : { auto: false, items: config.collections.items.length ? config.collections.items : buildManualSeed(store) },
              )
            }
          />
          <span className="text-sm text-foreground">Automatic — build tiles from my top categories</span>
        </label>
        {!config.collections.auto && (
          <div className="space-y-2">
            <Reorder.Group axis="y" values={config.collections.items} onReorder={(items) => patchCol({ items })} className="divide-y divide-gray-100 rounded-md border border-gray-200 bg-white">
              {config.collections.items.map((item) => (
                <Reorder.Item key={item.id} value={item}>
                  <div className="flex items-start gap-2 px-3 py-2.5 transition-colors hover:bg-gray-50">
                    <GripVertical className="mt-2 h-4 w-4 flex-shrink-0 cursor-grab text-gray-400 active:cursor-grabbing" />
                    <div className="flex-1 min-w-0 space-y-2">
                      <Input
                        value={item.label}
                        onChange={(e) => updateItem(config.collections.items, item.id, { label: e.target.value }, (items) => patchCol({ items }))}
                        placeholder="Tile label"
                      />
                      <Select
                        value={item.href}
                        onValueChange={(href) => updateItem(config.collections.items, item.id, { href }, (items) => patchCol({ items }))}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Links to category…" />
                        </SelectTrigger>
                        <SelectContent>
                          {store.categories.map((cat) => (
                            <SelectItem key={cat.id} value={cat.name}>
                              {cat.name}
                            </SelectItem>
                          ))}
                          {!store.categories.some((c) => c.name === item.href) && item.href && (
                            <SelectItem value={item.href}>{item.href}</SelectItem>
                          )}
                        </SelectContent>
                      </Select>
                      <ImageField
                        label="Tile image"
                        slot="collection"
                        value={item.image_url}
                        onChange={(url) => updateItem(config.collections.items, item.id, { image_url: url }, (items) => patchCol({ items }))}
                        compact
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => patchCol({ items: config.collections.items.filter((x) => x.id !== item.id) })}
                      className="text-muted-foreground hover:text-destructive p-1 cursor-pointer"
                      aria-label="Remove tile"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </Reorder.Item>
              ))}
            </Reorder.Group>
            {config.collections.items.length < 8 && (
              <AddButton
                label="Add tile"
                onClick={() =>
                  patchCol({
                    items: [
                      ...config.collections.items,
                      { id: uid(), label: store.categories[0]?.name || "New collection", image_url: null, href: store.categories[0]?.name || "" } as HomeCollection,
                    ],
                  })
                }
              />
            )}
          </div>
        )}
      </EditorSection>
      )}

      {activeTab === "story" && (
      <EditorSection
        title="Our story"
        description="Tell visitors who you are."
        enabled={config.story.enabled}
        onEnabledChange={(v) => patchStory({ enabled: v })}
      >
        <TextField label="Title" value={config.story.title} onChange={(v) => patchStory({ title: v })} />
        <TextAreaField label="Body" value={config.story.body} onChange={(v) => patchStory({ body: v })} rows={5} />
        <ImageField label="Story image" slot="story" value={config.story.image_url} onChange={(url) => patchStory({ image_url: url })} />
        <Field label="Image position">
          <Segmented
            value={config.story.layout}
            onChange={(v) => patchStory({ layout: v as "image-left" | "image-right" })}
            options={[
              { value: "image-right", label: "Image right" },
              { value: "image-left", label: "Image left" },
            ]}
          />
        </Field>
      </EditorSection>
      )}

      {activeTab === "services" && (
      <EditorSection
        title="Services teaser"
        description="Highlights your workshop. Pulls your top services automatically."
        enabled={config.services.enabled}
        onEnabledChange={(v) => patchSvc({ enabled: v })}
      >
        <div className="grid sm:grid-cols-2 gap-4">
          <TextField label="Title" value={config.services.title} onChange={(v) => patchSvc({ title: v })} />
          <TextField label="Subtitle" value={config.services.subtitle} onChange={(v) => patchSvc({ subtitle: v })} />
        </div>
        {store.services.length === 0 && (
          <p className="text-xs text-muted-foreground">
            You have no services yet — add some under the Services tab and they&apos;ll appear here.
          </p>
        )}
      </EditorSection>
      )}

      {activeTab === "gallery" && (
      <EditorSection
        title="Gallery"
        description="A photo wall of your shop, team and rides."
        enabled={config.gallery.enabled}
        onEnabledChange={(v) => patchGal({ enabled: v })}
      >
        <TextField label="Title" value={config.gallery.title} onChange={(v) => patchGal({ title: v })} />
        {config.gallery.images.length > 0 && (
          <Reorder.Group axis="y" values={config.gallery.images} onReorder={(images) => patchGal({ images })} className="divide-y divide-gray-100 rounded-md border border-gray-200 bg-white">
            {config.gallery.images.map((img) => (
              <Reorder.Item key={img.id} value={img}>
                <div className="flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-gray-50">
                <GripVertical className="h-4 w-4 flex-shrink-0 cursor-grab text-gray-400 active:cursor-grabbing" />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img.url} alt="" className="h-12 w-12 rounded object-cover flex-shrink-0" />
                <Input
                  value={img.caption ?? ""}
                  onChange={(e) => updateItem(config.gallery.images, img.id, { caption: e.target.value }, (images) => patchGal({ images }))}
                  placeholder="Caption (optional)"
                  className="flex-1"
                />
                <button
                  type="button"
                  onClick={() => patchGal({ images: config.gallery.images.filter((x) => x.id !== img.id) })}
                  className="text-muted-foreground hover:text-destructive p-1 cursor-pointer"
                  aria-label="Remove photo"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
                </div>
              </Reorder.Item>
            ))}
          </Reorder.Group>
        )}
        <GalleryUploader
          onAdd={(url) => patchGal({ images: [...config.gallery.images, { id: uid(), url } as HomeGalleryImage] })}
        />
      </EditorSection>
      )}

      {activeTab === "visit" && (
      <EditorSection
        title="Visit us"
        description="Address, phone and opening hours — pulled from your store."
        enabled={config.visit.enabled}
        onEnabledChange={(v) => patchVisit({ enabled: v })}
      >
        <TextField label="Title" value={config.visit.title} onChange={(v) => patchVisit({ title: v })} />
      </EditorSection>
      )}

      {activeTab === "carousels" && (
      <EditorSection
        title="Featured carousels"
        description="Pin up to two product carousels to your home page. Use the Layout tab to place each carousel separately."
        enabled={config.featured_carousels.enabled}
        onEnabledChange={(v) => patchFeaturedCarousels({ enabled: v })}
      >
        {(() => {
          const cats = (store.categories ?? []).filter(
            (c) => c.products.length > 0 && (c.store_page ?? "products") !== "bikes",
          );
          return (
            <div className="space-y-4">
              {/* Products per row */}
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Products per row</Label>
                <div className="flex w-fit items-center rounded-md bg-gray-100 p-0.5">
                  {([6, 8] as const).map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => patchFeaturedCarousels({ per_row: n })}
                      className={cn(
                        "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                        config.featured_carousels.per_row === n
                          ? "bg-white text-gray-800 shadow-sm"
                          : "text-gray-600 hover:bg-gray-200/70",
                      )}
                    >
                      {n} per row
                    </button>
                  ))}
                </div>
              </div>
              {([1, 2] as const).map((n) => {
                const slotKey = n === 1 ? "slot1" : "slot2";
                const selected = config.featured_carousels[slotKey] ?? "";
                const other = config.featured_carousels[n === 1 ? "slot2" : "slot1"] ?? "";
                return (
                  <div key={n} className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Carousel {n}</Label>
                    <select
                      value={selected}
                      onChange={(e) =>
                        patchFeaturedCarousels({ [slotKey]: e.target.value || null })
                      }
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <option value="">— None —</option>
                      {cats.map((c) => (
                        <option key={c.id} value={c.id} disabled={c.id === other}>
                          {c.name} ({c.product_count || c.products.length} products)
                        </option>
                      ))}
                    </select>
                  </div>
                );
              })}
            </div>
          );
        })()}
      </EditorSection>
      )}

      {activeTab === "layout" && (
      <div className="space-y-6">
      <EditorSection title="Badges & indicators" description="Choose which status indicators appear on your public profile.">
        <SettingsRow
          label={
            <span className="flex items-center gap-2">
              Hours on hero
              <span className={cn(
                "rounded-md px-1.5 py-0.5 text-xs font-medium transition-opacity",
                config.badges.show_hours_on_hero ? "bg-muted text-foreground" : "bg-muted text-muted-foreground opacity-50",
              )}>Mon 9:00–17:00</span>
            </span>
          }
          description="Show today's opening hours overlaid on the hero image."
          control={
            <Switch
              checked={config.badges.show_hours_on_hero}
              onCheckedChange={(v) => patchBadges({ show_hours_on_hero: v })}
            />
          }
        />
      </EditorSection>

      <EditorSection title="Section order" description="Drag to reorder sections. Carousel 1 and Carousel 2 can be placed independently — for example, one below services and one above the story.">
        <Reorder.Group axis="y" values={config.section_order} onReorder={setSectionOrder} className="divide-y divide-border rounded-md border border-border bg-background">
          {config.section_order.map((key) => (
            <Reorder.Item key={key} value={key}>
              <div className="flex cursor-grab items-center gap-3 px-3 py-2.5 transition-colors hover:bg-muted/50 active:cursor-grabbing">
              <GripVertical className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium text-foreground">{homeSectionLabel(key, config, store)}</span>
              </div>
            </Reorder.Item>
          ))}
        </Reorder.Group>
      </EditorSection>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={resetToDefaults}
          className="inline-flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <RotateCcw className="h-3.5 w-3.5" /> Reset everything to defaults
        </button>
      </div>
      </div>
      )}

      <div className="border-t border-border/60 pt-6">
        <div className="mb-4 flex items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-medium text-foreground">Live preview</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">See how your landing page looks to customers.</p>
          </div>
          <button
            type="button"
            onClick={() => setShowPreview((v) => !v)}
            className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            {showPreview ? "Hide" : "Show"}
          </button>
        </div>
        {showPreview && previewStore ? (
          <div className="overflow-hidden rounded-md border border-border bg-muted/30">
            <StoreHomeTab store={previewStore} isOwnProfile={false} onNavigate={() => {}} onOpenCollection={() => {}} />
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Preview hidden.</p>
        )}
      </div>
      </div>
    </DashboardFloatingPage>
  );
}

// ============================================================
// Reusable pieces
// ============================================================
function EditorSection({
  title,
  description,
  enabled,
  onEnabledChange,
  children,
}: {
  title: string;
  description?: string;
  enabled?: boolean;
  onEnabledChange?: (v: boolean) => void;
  children: React.ReactNode;
}) {
  const hasToggle = onEnabledChange != null;
  const dimmed = hasToggle && enabled === false;
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-medium text-foreground">{title}</h3>
          {description ? <p className="mt-0.5 text-xs text-muted-foreground">{description}</p> : null}
        </div>
        {hasToggle ? (
          <Switch checked={!!enabled} onCheckedChange={onEnabledChange} className="mt-0.5 flex-shrink-0" />
        ) : null}
      </div>
      {!dimmed ? <div className="space-y-4">{children}</div> : null}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <Field label={label}>
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </Field>
  );
}

function TextAreaField({
  label,
  value,
  onChange,
  rows = 3,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
}) {
  return (
    <Field label={label}>
      <Textarea value={value} onChange={(e) => onChange(e.target.value)} rows={rows} />
    </Field>
  );
}

function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div className="flex w-fit items-center rounded-md bg-gray-100 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            "cursor-pointer rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
            value === o.value ? "bg-white text-gray-800 shadow-sm" : "text-gray-600 hover:bg-gray-200/70",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function BannerEditorRow({
  banner,
  onChange,
  onRemove,
}: {
  banner: HomeBanner;
  onChange: (next: HomeBanner) => void;
  onRemove?: () => void;
}) {
  const isWeekly = banner.kind === "weekly_specials";
  const hrefIsCustom = !BANNER_HREF_KNOWN.includes(banner.href);

  return (
    <div className="space-y-3 px-3 py-3 transition-colors hover:bg-gray-50">
      <div className="flex items-start gap-2">
        <GripVertical className="mt-2 h-4 w-4 flex-shrink-0 cursor-grab text-gray-400 active:cursor-grabbing" />
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-md bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600">
              {isWeekly ? "Weekly specials" : "Custom banner"}
            </span>
            <label className="ml-auto flex cursor-pointer items-center gap-2">
              <Switch
                checked={banner.enabled}
                onCheckedChange={(enabled) => onChange({ ...banner, enabled })}
              />
              <span className="text-xs text-muted-foreground">Shown</span>
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <TextField
              label="Title"
              value={banner.title}
              onChange={(title) => onChange({ ...banner, title })}
              placeholder={isWeekly ? "Weekly specials" : "Summer sale"}
            />
            <TextField
              label={isWeekly ? "Subtitle (leave blank for live deal count)" : "Subtitle"}
              value={banner.subtitle}
              onChange={(subtitle) => onChange({ ...banner, subtitle })}
              placeholder={isWeekly ? "Auto from sale items" : "Up to 50% off selected gear"}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <TextField
              label="Footer text"
              value={banner.footer_text}
              onChange={(footer_text) => onChange({ ...banner, footer_text })}
              placeholder={isWeekly ? "Changes weekly" : "Tap to explore"}
            />
            {!isWeekly && (
              <Field label="When tapped">
                <Select
                  value={hrefIsCustom ? "custom" : banner.href}
                  onValueChange={(v) =>
                    onChange({
                      ...banner,
                      href: v === "custom" ? (hrefIsCustom ? banner.href : "https://") : v,
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {BANNER_HREF_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            )}
          </div>

          {!isWeekly && hrefIsCustom && (
            <Input
              value={banner.href}
              onChange={(e) => onChange({ ...banner, href: e.target.value })}
              placeholder="https://example.com"
            />
          )}

          <ImageField
            label={isWeekly ? "Thumbnail (optional — defaults to first deal)" : "Thumbnail"}
            slot={`banner-${banner.id}`}
            value={banner.image_url}
            onChange={(image_url) => onChange({ ...banner, image_url })}
            compact
          />
        </div>

        {onRemove ? (
          <button
            type="button"
            onClick={onRemove}
            className="cursor-pointer p-1 text-muted-foreground hover:text-destructive"
            aria-label="Remove banner"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        ) : null}
      </div>
    </div>
  );
}

function AddButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-md border border-dashed border-gray-200 bg-white py-2.5 text-sm text-gray-600 transition-colors hover:border-gray-300 hover:text-gray-900"
    >
      <Plus className="h-4 w-4" /> {label}
    </button>
  );
}

function IconPicker({ value, onChange }: { value: string; onChange: (icon: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {HOMEPAGE_ICON_KEYS.map((key) => {
        const Icon = getHomepageIcon(key);
        const active = key === value;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onChange(key)}
            className={cn(
              "flex h-8 w-8 cursor-pointer items-center justify-center rounded-md border transition-colors",
              active ? "border-gray-800 bg-gray-800 text-white" : "border-gray-200 text-gray-500 hover:border-gray-300 hover:text-gray-800",
            )}
            aria-label={key}
          >
            <Icon className="h-4 w-4" />
          </button>
        );
      })}
    </div>
  );
}

function CtaRow({ cta, onChange }: { cta: HomeCta; onChange: (c: HomeCta) => void }) {
  const isCustom = !CTA_KNOWN.includes(cta.href);
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      <Input value={cta.label} onChange={(e) => onChange({ ...cta, label: e.target.value })} placeholder="Button label" />
      <Select
        value={isCustom ? "custom" : cta.href}
        onValueChange={(v) => onChange({ ...cta, href: v === "custom" ? (isCustom ? cta.href : "https://") : v })}
      >
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {CTA_OPTIONS.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {isCustom && (
        <Input
          className="sm:col-span-2"
          value={cta.href}
          onChange={(e) => onChange({ ...cta, href: e.target.value })}
          placeholder="https://example.com"
        />
      )}
    </div>
  );
}

function ImageField({
  label,
  slot,
  value,
  onChange,
  hint,
  compact,
}: {
  label: string;
  slot: string;
  value: string | null;
  onChange: (url: string | null) => void;
  hint?: string;
  compact?: boolean;
}) {
  const [uploading, setUploading] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setErr(null);
    try {
      const url = await uploadHomepageImage(file, slot);
      onChange(url);
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Upload failed");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <Field label={label}>
      <div className="flex items-center gap-3">
        <div
          className={cn(
            "relative flex-shrink-0 overflow-hidden rounded-md border-2 border-dashed border-border bg-muted flex items-center justify-center",
            compact ? "h-14 w-14" : "h-16 w-24",
          )}
        >
          {value ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={value} alt="" className="h-full w-full object-cover" />
              <button
                type="button"
                onClick={() => onChange(null)}
                className="absolute top-0.5 right-0.5 rounded-full bg-background/90 border border-border p-0.5 hover:bg-background cursor-pointer"
                aria-label="Remove image"
              >
                <X className="h-3 w-3 text-muted-foreground" />
              </button>
            </>
          ) : uploading ? (
            <Loader2 className="h-5 w-5 text-muted-foreground animate-spin" />
          ) : (
            <ImageIcon className="h-5 w-5 text-muted-foreground/40" />
          )}
        </div>
        <div className="flex-1 space-y-1">
          <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp,image/avif" onChange={onFile} className="hidden" />
          <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()} disabled={uploading} className="gap-1.5">
            {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
            {value ? "Replace" : "Upload"}
          </Button>
          {hint && !err && <p className="text-xs text-muted-foreground">{hint}</p>}
          {err && <p className="text-xs text-destructive">{err}</p>}
        </div>
      </div>
    </Field>
  );
}

function HeroImagesField({
  value,
  onChange,
}: {
  value: string[];
  onChange: (urls: string[]) => void;
}) {
  const [uploading, setUploading] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const urls = value.slice(0, 3);
  const remaining = Math.max(0, 3 - urls.length);

  const onFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []).slice(0, remaining);
    if (files.length === 0) return;

    setUploading(true);
    setErr(null);
    try {
      const uploaded: string[] = [];
      for (const [index, file] of files.entries()) {
        uploaded.push(await uploadHomepageImage(file, `hero-${urls.length + index + 1}`));
      }
      onChange([...urls, ...uploaded].slice(0, 3));
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Upload failed");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <Field label="Header images">
      <div className="space-y-3">
        <div className="grid grid-cols-3 gap-2">
          {[0, 1, 2].map((index) => {
            const url = urls[index];
            return (
              <div
                key={index}
                className="relative aspect-[4/3] overflow-hidden rounded-md border-2 border-dashed border-border bg-muted flex items-center justify-center"
              >
                {url ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt="" className="h-full w-full object-cover" />
                    <button
                      type="button"
                      onClick={() => onChange(urls.filter((_, i) => i !== index))}
                      className="absolute top-1 right-1 rounded-full bg-background/90 border border-border p-0.5 hover:bg-background cursor-pointer"
                      aria-label="Remove header image"
                    >
                      <X className="h-3 w-3 text-muted-foreground" />
                    </button>
                  </>
                ) : uploading ? (
                  <Loader2 className="h-5 w-5 text-muted-foreground animate-spin" />
                ) : (
                  <ImageIcon className="h-5 w-5 text-muted-foreground/40" />
                )}
              </div>
            );
          })}
        </div>
        <div className="space-y-1">
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/avif"
            multiple
            onChange={onFiles}
            className="hidden"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => inputRef.current?.click()}
            disabled={uploading || remaining === 0}
            className="gap-1.5"
          >
            {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
            {remaining === 0 ? "Maximum added" : urls.length ? "Add header" : "Upload headers"}
          </Button>
          {err ? (
            <p className="text-xs text-destructive">{err}</p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Upload up to 3 header images. They are compressed to WebP and resized for fast web and mobile loading.
            </p>
          )}
        </div>
      </div>
    </Field>
  );
}

function GalleryUploader({ onAdd }: { onAdd: (url: string) => void }) {
  const [uploading, setUploading] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const onFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    setUploading(true);
    setErr(null);
    try {
      for (const file of files) {
        const url = await uploadHomepageImage(file, "gallery");
        onAdd(url);
      }
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Upload failed");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="space-y-1">
      <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp,image/avif" multiple onChange={onFiles} className="hidden" />
      <AddButton
        label={uploading ? "Uploading…" : "Add photos"}
        onClick={() => !uploading && inputRef.current?.click()}
      />
      {err && <p className="text-xs text-destructive">{err}</p>}
    </div>
  );
}

// ── small utils ────────────────────────────────────────────
function updateItem<T extends { id: string }>(
  list: T[],
  id: string,
  patch: Partial<T>,
  commit: (next: T[]) => void,
) {
  commit(list.map((it) => (it.id === id ? { ...it, ...patch } : it)));
}

/** Seed a couple of manual collection tiles from the store's categories. */
function buildManualSeed(store: StoreProfile): HomeCollection[] {
  return store.categories.slice(0, 3).map((c) => ({
    id: uid(),
    label: c.name,
    image_url: null,
    href: c.name,
  }));
}

/** A <input type=color> needs a 6-digit hex; coerce anything else. */
function normalizeHex(hex: string): string {
  if (/^#[0-9a-fA-F]{6}$/.test(hex)) return hex;
  if (/^#[0-9a-fA-F]{3}$/.test(hex)) {
    const m = hex.slice(1);
    return `#${m[0]}${m[0]}${m[1]}${m[1]}${m[2]}${m[2]}`;
  }
  return BRAND_YELLOW;
}
