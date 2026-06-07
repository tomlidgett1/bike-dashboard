import { redirect } from "next/navigation";

const VALID = [
  "home",
  "homev2",
  "nest",
  "landing",
  "carousels",
  "categories",
  "sections",
  "brands",
  "services",
  "analytics",
  "products",
  "titles",
];

// /settings/store now lives as focused sub-pages. Redirect to the right one,
// keeping backwards compatibility with old ?tab= deep links.
export default async function StoreSettingsIndex({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  if (tab === "online") {
    redirect("/optimize?workflow=online");
  }
  const dest =
    tab === "categories" ? "carousels" : tab && VALID.includes(tab) ? tab : "homev2";
  redirect(`/settings/store/${dest}`);
}
