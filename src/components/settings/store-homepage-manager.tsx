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
 * Saves the whole config to PUT /api/store/homepage. Images upload to
 * POST /api/store/homepage/upload.
 */

import * as React from "react";
import { Reorder } from "framer-motion";
import {
  Loader2,
  Save,
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
  Eye,
  Star,
  GalleryHorizontal,
} from "lucide-react";
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
import { useAuth } from "@/components/providers/auth-provider";
import { StoreHomeTab } from "@/components/marketplace/store-profile/store-home-tab";
import {
  resolveHomepageConfig,
  BRAND_YELLOW,
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
  HeroVariant,
} from "@/lib/types/store";

// ── Static option tables ───────────────────────────────────
const SECTION_LABELS: Record<HomeSectionKey, string> = {
  highlights: "Highlights",
  collections: "Collections",
  carousels: "Featured carousels",
  story: "Our story",
  services: "Services",
  gallery: "Gallery",
  visit: "Visit us",
};

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
      setConfig(resolveHomepageConfig(raw, profile));
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

  // Mark the editor dirty whenever the config changes after first load.
  const handleSave = async () => {
    if (!config) return;
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch("/api/store/homepage", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 503) setMigrated(false);
        throw new Error(data?.error || "Failed to save");
      }
      setSavedAt(Date.now());
      setTimeout(() => setSavedAt(null), 2500);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-7 w-7 text-muted-foreground animate-spin" />
      </div>
    );
  }

  if (loadError || !config || !store) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-center">
        <AlertTriangle className="h-6 w-6 text-destructive mx-auto mb-2" />
        <p className="text-sm text-foreground font-medium">{loadError || "Couldn't load your home page settings"}</p>
        <Button variant="outline" size="sm" onClick={load} className="mt-4">
          <RotateCcw className="h-3.5 w-3.5 mr-2" /> Try again
        </Button>
      </div>
    );
  }

  const liveUrl = `/marketplace/store/${user?.id}`;

  return (
    <div className="space-y-5">
      {/* Migration warning */}
      {!migrated && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3">
          <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-medium text-amber-900">Saving isn&apos;t enabled yet</p>
            <p className="text-amber-800 mt-0.5">
              The database column for home pages hasn&apos;t been created. Run{" "}
              <code className="rounded bg-amber-100 px-1 py-0.5 text-xs">supabase db push</code>{" "}
              to enable saving. You can still design your page below.
            </p>
          </div>
        </div>
      )}

      {/* ── Sticky action bar ── */}
      <div className="sticky top-0 z-20 -mx-1 flex items-center justify-between gap-3 rounded-lg border border-border bg-card/95 backdrop-blur px-3 py-2.5 shadow-sm">
        <label className="flex items-center gap-2.5 cursor-pointer">
          <Switch checked={config.enabled} onCheckedChange={setEnabled} />
          <span className="text-sm font-medium text-foreground">
            {config.enabled ? "Home tab is on" : "Home tab is off"}
          </span>
        </label>
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm" className="gap-1.5 text-muted-foreground">
            <a href={liveUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-3.5 w-3.5" /> View live
            </a>
          </Button>
          <Button onClick={handleSave} disabled={saving} size="sm" className="gap-1.5 min-w-[92px]">
            {saving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : savedAt ? (
              <Check className="h-3.5 w-3.5" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}
            {saving ? "Saving" : savedAt ? "Saved" : "Save"}
          </Button>
        </div>
      </div>
      {saveError && (
        <p className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md px-3 py-2">
          {saveError}
        </p>
      )}

      {/* ── Theme ── */}
      <SectionCard icon={Palette} title="Theme" description="Accent colour used across buttons and highlights.">
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
      </SectionCard>

      {/* ── Hero ── */}
      <SectionCard icon={ImageIcon} title="Hero" description="The first thing visitors see.">
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
        <ImageField
          label="Hero image"
          slot="hero"
          value={config.hero.image_url}
          onChange={(url) => patchHero({ image_url: url })}
          hint="Wide, high-quality photo works best. Leave empty for a branded gradient."
        />
        <TextField label="Eyebrow" value={config.hero.eyebrow} onChange={(v) => patchHero({ eyebrow: v })} placeholder="Your local bike shop" />
        <TextField label="Headline" value={config.hero.headline} onChange={(v) => patchHero({ headline: v })} placeholder={store.store_name} />
        <TextAreaField label="Subheadline" value={config.hero.subheadline} onChange={(v) => patchHero({ subheadline: v })} rows={2} />
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
      </SectionCard>

      {/* ── Announcement ── */}
      <SectionCard
        icon={Megaphone}
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
      </SectionCard>

      {/* ── Highlights ── */}
      <SectionCard
        icon={Sparkles}
        title="Highlights"
        description="Short selling points shown as a row of cards."
        enabled={config.highlights.enabled}
        onEnabledChange={(v) => patchHi({ enabled: v })}
      >
        <Reorder.Group axis="y" values={config.highlights.items} onReorder={(items) => patchHi({ items })} className="space-y-2">
          {config.highlights.items.map((item) => (
            <Reorder.Item key={item.id} value={item} className="rounded-lg border border-border bg-card p-3">
              <div className="flex items-start gap-2">
                <GripVertical className="h-4 w-4 text-muted-foreground/50 mt-2 flex-shrink-0 cursor-grab active:cursor-grabbing" />
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
      </SectionCard>

      {/* ── Collections ── */}
      <SectionCard
        icon={LayoutGrid}
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
            <Reorder.Group axis="y" values={config.collections.items} onReorder={(items) => patchCol({ items })} className="space-y-2">
              {config.collections.items.map((item) => (
                <Reorder.Item key={item.id} value={item} className="rounded-lg border border-border bg-card p-3">
                  <div className="flex items-start gap-2">
                    <GripVertical className="h-4 w-4 text-muted-foreground/50 mt-2 flex-shrink-0 cursor-grab active:cursor-grabbing" />
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
      </SectionCard>

      {/* ── Story ── */}
      <SectionCard
        icon={BookOpen}
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
      </SectionCard>

      {/* ── Services ── */}
      <SectionCard
        icon={Wrench}
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
      </SectionCard>

      {/* ── Gallery ── */}
      <SectionCard
        icon={Images}
        title="Gallery"
        description="A photo wall of your shop, team and rides."
        enabled={config.gallery.enabled}
        onEnabledChange={(v) => patchGal({ enabled: v })}
      >
        <TextField label="Title" value={config.gallery.title} onChange={(v) => patchGal({ title: v })} />
        {config.gallery.images.length > 0 && (
          <Reorder.Group axis="y" values={config.gallery.images} onReorder={(images) => patchGal({ images })} className="space-y-2">
            {config.gallery.images.map((img) => (
              <Reorder.Item key={img.id} value={img} className="flex items-center gap-3 rounded-lg border border-border bg-card p-2">
                <GripVertical className="h-4 w-4 text-muted-foreground/50 flex-shrink-0 cursor-grab active:cursor-grabbing" />
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
              </Reorder.Item>
            ))}
          </Reorder.Group>
        )}
        <GalleryUploader
          onAdd={(url) => patchGal({ images: [...config.gallery.images, { id: uid(), url } as HomeGalleryImage] })}
        />
      </SectionCard>

      {/* ── Visit ── */}
      <SectionCard
        icon={MapPin}
        title="Visit us"
        description="Address, phone and opening hours — pulled from your store."
        enabled={config.visit.enabled}
        onEnabledChange={(v) => patchVisit({ enabled: v })}
      >
        <TextField label="Title" value={config.visit.title} onChange={(v) => patchVisit({ title: v })} />
      </SectionCard>

      {/* ── Featured carousels ── */}
      <SectionCard
        icon={GalleryHorizontal}
        title="Featured carousels"
        description="Pin up to two product carousels to your home page."
        enabled={config.featured_carousels.enabled}
        onEnabledChange={(v) => patchFeaturedCarousels({ enabled: v })}
      >
        {(() => {
          const cats = (store.categories ?? []).filter((c) => c.products.length > 0);
          return (
            <div className="space-y-4">
              {/* Products per row */}
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Products per row</Label>
                <div className="flex gap-2">
                  {([6, 8] as const).map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => patchFeaturedCarousels({ per_row: n })}
                      className={cn(
                        "flex-1 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors",
                        config.featured_carousels.per_row === n
                          ? "border-foreground bg-foreground text-background"
                          : "border-input bg-background text-muted-foreground hover:bg-secondary"
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
      </SectionCard>

      {/* ── Badges ── */}
      <SectionCard icon={Eye} title="Badges & indicators" description="Choose which status indicators appear on your public profile.">
        <div className="divide-y divide-border">
          <div className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
            <div>
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-foreground">Open / Closed status</p>
                <span className={cn(
                  "text-xs font-medium px-1.5 py-0.5 rounded-full transition-opacity",
                  config.badges.show_open_status ? "bg-green-50 text-green-700" : "opacity-25 bg-gray-100 text-gray-500",
                )}>Open now</span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">Show a live open or closed pill next to your opening hours and on the About tab.</p>
            </div>
            <Switch
              checked={config.badges.show_open_status}
              onCheckedChange={(v) => patchBadges({ show_open_status: v })}
            />
          </div>
          <div className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
            <div>
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-foreground">Hours on hero</p>
                <span className={cn(
                  "text-xs font-medium px-1.5 py-0.5 rounded-full transition-opacity",
                  config.badges.show_hours_on_hero ? "bg-blue-50 text-blue-700" : "opacity-25 bg-gray-100 text-gray-500",
                )}>Mon 9:00–17:00</span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">Show today's opening hours overlaid on the hero image.</p>
            </div>
            <Switch
              checked={config.badges.show_hours_on_hero}
              onCheckedChange={(v) => patchBadges({ show_hours_on_hero: v })}
            />
          </div>
          <div className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
            <div>
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-foreground">Star rating</p>
                <span className={cn(
                  "inline-flex items-center gap-0.5 text-xs font-semibold transition-opacity",
                  config.badges.show_rating ? "text-amber-500" : "opacity-25 text-gray-400",
                )}>
                  <Star className="h-3 w-3 fill-current" />
                  4.8
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">Show your rating score in the store header.</p>
            </div>
            <Switch
              checked={config.badges.show_rating}
              onCheckedChange={(v) => patchBadges({ show_rating: v })}
            />
          </div>
        </div>
      </SectionCard>

      {/* ── Section order ── */}
      <SectionCard icon={ListOrdered} title="Section order" description="Drag to reorder how sections appear down the page.">
        <Reorder.Group axis="y" values={config.section_order} onReorder={setSectionOrder} className="space-y-2">
          {config.section_order.map((key) => (
            <Reorder.Item
              key={key}
              value={key}
              className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5 cursor-grab active:cursor-grabbing"
            >
              <GripVertical className="h-4 w-4 text-muted-foreground/50" />
              <span className="text-sm font-medium text-foreground">{SECTION_LABELS[key]}</span>
            </Reorder.Item>
          ))}
        </Reorder.Group>
      </SectionCard>

      {/* ── Reset ── */}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={resetToDefaults}
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
        >
          <RotateCcw className="h-3.5 w-3.5" /> Reset everything to defaults
        </button>
      </div>

      {/* ── Live preview ── */}
      <div className="rounded-xl border border-border overflow-hidden">
        <div className="flex items-center justify-between gap-2 border-b border-border bg-muted/40 px-3 py-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Home className="h-3.5 w-3.5" />
            <span className="font-medium">Live preview</span>
          </div>
          <button
            type="button"
            onClick={() => setShowPreview((v) => !v)}
            className="text-xs text-muted-foreground hover:text-foreground cursor-pointer"
          >
            {showPreview ? "Hide" : "Show"}
          </button>
        </div>
        {showPreview && previewStore && (
          <div className="bg-gray-50">
            <StoreHomeTab store={previewStore} isOwnProfile={false} onNavigate={() => {}} onOpenCollection={() => {}} />
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// Reusable pieces
// ============================================================
function SectionCard({
  icon: Icon,
  title,
  description,
  enabled,
  onEnabledChange,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  enabled?: boolean;
  onEnabledChange?: (v: boolean) => void;
  children: React.ReactNode;
}) {
  const hasToggle = onEnabledChange != null;
  const dimmed = hasToggle && enabled === false;
  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex items-start justify-between gap-3 px-4 py-3.5 border-b border-border">
        <div className="flex items-start gap-3 min-w-0">
          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md bg-secondary">
            <Icon className="h-4 w-4 text-foreground" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-foreground">{title}</h3>
            {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
          </div>
        </div>
        {hasToggle && <Switch checked={!!enabled} onCheckedChange={onEnabledChange} className="mt-1 flex-shrink-0" />}
      </div>
      {!dimmed && <div className="p-4 space-y-4">{children}</div>}
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
    <div className="inline-flex rounded-md border border-input p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            "px-3 py-1.5 text-xs font-medium rounded cursor-pointer transition-colors",
            value === o.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function AddButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border py-2.5 text-sm text-muted-foreground hover:border-foreground/30 hover:text-foreground transition-colors cursor-pointer"
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
              "flex h-8 w-8 items-center justify-center rounded-md border transition-colors cursor-pointer",
              active ? "border-foreground bg-foreground text-background" : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30",
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
