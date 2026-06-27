// Melbourne cycling geography — the local graph the agent targets.
// Slugs are URL segments; labels are display strings.

export const CITIES = ['melbourne', 'sydney', 'brisbane', 'perth', 'adelaide'];

// Inner-east / cycling-heavy suburbs first (the strongest local wedge).
export const MELBOURNE_SUBURBS = [
  'ashburton', 'glen-iris', 'camberwell', 'hawthorn', 'kew', 'richmond',
  'fitzroy', 'collingwood', 'prahran', 'south-yarra', 'malvern', 'armadale',
  'toorak', 'brighton', 'st-kilda', 'brunswick', 'northcote', 'carlton',
];

const LABEL_OVERRIDES: Record<string, string> = {
  'glen-iris': 'Glen Iris',
  'south-yarra': 'South Yarra',
  'st-kilda': 'St Kilda',
};

export function placeLabel(slug: string): string {
  if (LABEL_OVERRIDES[slug]) return LABEL_OVERRIDES[slug];
  return slug.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

// Find the first known place mentioned in free text (e.g. a GSC query).
// Returns the slug, or null.
export function findPlaceInText(text: string): string | null {
  const t = ` ${text.toLowerCase()} `;
  for (const s of [...MELBOURNE_SUBURBS, ...CITIES]) {
    const name = s.replace(/-/g, ' ');
    if (t.includes(` ${name} `)) return s;
  }
  return null;
}
