import { BRAND_YELLOW } from "@/lib/marketplace/homepage-config";

export const DEFAULT_HEADER_IMAGES = [
  {
    id: "open-road",
    label: "Open road",
    url: "https://images.unsplash.com/photo-1485965120188-e220f721d03e?w=1920&q=80&auto=format&fit=crop",
  },
  {
    id: "trail-ride",
    label: "Trail ride",
    url: "https://images.unsplash.com/photo-1532298229144-0ec0c57515c7?w=1920&q=80&auto=format&fit=crop",
  },
  {
    id: "group-ride",
    label: "Group ride",
    url: "https://images.unsplash.com/photo-1517649763968-0c62306601b7?w=1920&q=80&auto=format&fit=crop",
  },
  {
    id: "workshop",
    label: "Workshop",
    url: "https://images.unsplash.com/photo-1571068316344-75bc76f77890?w=1920&q=80&auto=format&fit=crop",
  },
  {
    id: "urban-commute",
    label: "Urban commute",
    url: "https://images.unsplash.com/photo-1558618042-3ecacf4d2a63?w=1920&q=80&auto=format&fit=crop",
  },
] as const;

export const STOREFRONT_THEME_PRESETS = [
  { id: "yellow-jersey", label: "Yellow Jersey", accent: BRAND_YELLOW },
  { id: "midnight", label: "Midnight", accent: "#171717" },
  { id: "ocean", label: "Ocean blue", accent: "#2563eb" },
  { id: "forest", label: "Forest green", accent: "#15803d" },
  { id: "crimson", label: "Crimson", accent: "#dc2626" },
] as const;
