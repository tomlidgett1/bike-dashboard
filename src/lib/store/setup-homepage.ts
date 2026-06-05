import type { StoreHomepageConfig } from "@/lib/types/store";

export async function fetchRawHomepageConfig(): Promise<Partial<StoreHomepageConfig>> {
  const res = await fetch("/api/store/homepage", { cache: "no-store" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Failed to load homepage settings");
  return (data.config ?? {}) as Partial<StoreHomepageConfig>;
}

export async function saveHomepageConfig(config: Partial<StoreHomepageConfig>) {
  const res = await fetch("/api/store/homepage", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ config: config as StoreHomepageConfig }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Failed to save homepage settings");
}

export async function patchHomepageTheme(accent: string) {
  const current = await fetchRawHomepageConfig();
  await saveHomepageConfig({
    ...current,
    theme: { accent },
  });
}

export async function patchHomepageHeroImage(url: string) {
  const current = await fetchRawHomepageConfig();
  await saveHomepageConfig({
    ...current,
    hero: {
      ...(current.hero ?? {}),
      image_urls: [url],
      image_url: url,
    } as StoreHomepageConfig["hero"],
  });
}

/** Keep landing-page hero copy aligned with profile fields saved in Settings. */
export async function patchHomepageHeroCopy(fields: {
  headline?: string;
  eyebrow?: string;
}) {
  const current = await fetchRawHomepageConfig();
  const hero = current.hero ?? {};
  await saveHomepageConfig({
    ...current,
    hero: {
      ...hero,
      ...(fields.headline !== undefined ? { headline: fields.headline } : {}),
      ...(fields.eyebrow !== undefined ? { eyebrow: fields.eyebrow } : {}),
    } as StoreHomepageConfig["hero"],
  });
}

/** Bio is stored on users.bio (About tab) and story.body (Home → Our story). */
export async function patchHomepageStory(body: string, storeName?: string) {
  const current = await fetchRawHomepageConfig();
  const story = (current.story ?? {}) as Partial<StoreHomepageConfig["story"]>;
  const existingTitle = typeof story.title === "string" ? story.title.trim() : "";
  await saveHomepageConfig({
    ...current,
    story: {
      ...story,
      enabled: true,
      body: body.trim(),
      title: existingTitle || (storeName ? `The ${storeName} story` : "Our story"),
    } as StoreHomepageConfig["story"],
  });
}

export async function uploadHomepageHeroImage(file: File): Promise<string> {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("slot", "hero-setup");
  const res = await fetch("/api/store/homepage/upload", { method: "POST", body: fd });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Failed to upload header image");
  return data.url as string;
}
