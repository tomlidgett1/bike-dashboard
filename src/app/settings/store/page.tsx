import { redirect } from "next/navigation";

const VALID = [
  "home",
  "categories",
  "sections",
  "brands",
  "services",
  "analytics",
  "products",
  "titles",
  "online",
];

// /settings/store now lives as focused sub-pages. Redirect to the right one,
// keeping backwards compatibility with old ?tab= deep links.
export default async function StoreSettingsIndex({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const dest = tab && VALID.includes(tab) ? tab : "home";
  redirect(`/settings/store/${dest}`);
}
