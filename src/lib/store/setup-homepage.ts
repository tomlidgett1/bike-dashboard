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

export async function uploadHomepageHeroImage(file: File): Promise<string> {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("slot", "hero-setup");
  const res = await fetch("/api/store/homepage/upload", { method: "POST", body: fd });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Failed to upload header image");
  return data.url as string;
}
