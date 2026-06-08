export type FeaturedBrandKey = "apollo" | "orbea" | "focus" | "kalkhoff";

export type FeaturedBrandAbout = {
  key: FeaturedBrandKey;
  /** Display name shown in the section heading */
  name: string;
  tagline: string;
  paragraphs: string[];
  highlights: string[];
  origin: string;
  established: string;
  logoSrc?: string;
  youtubeVideoId?: string;
};

const FEATURED_BRANDS: Record<FeaturedBrandKey, FeaturedBrandAbout> = {
  apollo: {
    key: "apollo",
    name: "Apollo",
    tagline: "Australian bikes built for local conditions",
    established: "Est. 1978",
    origin: "Melbourne, Australia",
    highlights: ["Australian-owned", "Everyday value", "Road & MTB"],
    paragraphs: [
      "Apollo has been designing and selling bicycles in Australia since 1978, with in-house development and testing based in Melbourne. The brand focuses on practical road, mountain, hybrid and kids bikes tuned for Australian riding conditions.",
      "From first bikes to capable weekend riders, Apollo is known for approachable pricing, dependable spec and a local identity riders recognise on paths and trails across the country.",
    ],
  },
  orbea: {
    key: "orbea",
    name: "Orbea",
    logoSrc: "/brands/orbea-logo.svg",
    youtubeVideoId: "0AAdKqnB3Wg",
    tagline: "Basque heritage, rider-owned craftsmanship",
    established: "Est. 1840",
    origin: "Basque Country, Spain",
    highlights: ["Employee-owned", "Race-proven", "Road & MTB"],
    paragraphs: [
      "Orbea is one of cycling's longest-running marques, with roots in Spain's Basque Country stretching back to 1840 and dedicated bicycle production from the 1930s. Today it is an employee-owned cooperative and one of Europe's largest bicycle manufacturers.",
      "Orbea builds road, mountain, gravel and e-bikes with a strong reputation for lightweight frames, confident handling and race-proven design — from World Cup trails to gran fondo roads.",
    ],
  },
  focus: {
    key: "focus",
    name: "Focus",
    tagline: "German engineering from a champion's vision",
    established: "Est. 1992",
    origin: "Stuttgart, Germany",
    highlights: ["Developed in Germany", "Performance-led", "Road & e-MTB"],
    paragraphs: [
      "Focus was founded in Germany by three-time cyclocross world champion Mike Kluge, growing from a rider's project into a premium brand for road, gravel, mountain and e-bikes.",
      "Bikes are developed in Stuttgart and assembled in Germany, with a philosophy centred on precise handling, thoughtful integration and products that feel dialed from the first pedal stroke.",
    ],
  },
  kalkhoff: {
    key: "kalkhoff",
    name: "Kalkhoff",
    tagline: "A century of German e-bike expertise",
    established: "Est. 1919",
    origin: "Cloppenburg, Germany",
    highlights: ["Made in Germany", "E-bike specialist", "Built to last"],
    paragraphs: [
      "Kalkhoff has been building bicycles in Germany since 1919, evolving into one of Europe's most trusted names for premium e-bikes. City, trekking and all-road models are designed around seamless integration, comfort and everyday reliability.",
      "With a long manufacturing heritage and a focus on refined motor and battery systems, Kalkhoff e-bikes are built for commuters and leisure riders who want quiet, dependable performance year after year.",
    ],
  },
};

/** Normalise marketplace brand strings to a featured brand key, if matched. */
export function resolveFeaturedBrandKey(
  brand: string | null | undefined,
): FeaturedBrandKey | null {
  if (!brand?.trim()) return null;

  const normalised = brand
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

  const aliases: Record<string, FeaturedBrandKey> = {
    apollo: "apollo",
    orbea: "orbea",
    obrea: "orbea",
    focus: "focus",
    focusbikes: "focus",
    kalkhoff: "kalkhoff",
    kalkhoffbikes: "kalkhoff",
  };

  return aliases[normalised] ?? null;
}

export function getFeaturedBrandAbout(
  brand: string | null | undefined,
): FeaturedBrandAbout | null {
  const key = resolveFeaturedBrandKey(brand);
  return key ? FEATURED_BRANDS[key] : null;
}
