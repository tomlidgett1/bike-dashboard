// URL/slug helpers shared by the agent. Kept dependency-free (Deno + browser safe).

export function slugify(input?: string | null): string {
  return (input || '')
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 70)
    .replace(/-+$/g, '');
}

export function titleCase(input: string): string {
  return input
    .split(/[\s-]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

// Normalise a free-text suburb/city to a slug we use in URLs and as a key.
export function normaliseLocation(input?: string | null): string {
  return slugify(input);
}

// The category taxonomy the page factory understands, mapped to display labels.
export const BIKE_CATEGORY_LABELS: Record<string, string> = {
  'road-bikes': 'Road Bikes',
  'gravel-bikes': 'Gravel Bikes',
  'mountain-bikes': 'Mountain Bikes',
  'electric-bikes': 'Electric Bikes',
  'commuter-bikes': 'Commuter Bikes',
  'kids-bikes': 'Kids Bikes',
  'used-bikes': 'Used Bikes',
  'bikes': 'Bikes',
};

export function categoryLabel(slug: string): string {
  return BIKE_CATEGORY_LABELS[slug] ?? titleCase(slug);
}
