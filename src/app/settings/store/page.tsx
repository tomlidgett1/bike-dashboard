import { redirect } from "next/navigation";

const VALID = [
  "home",
  "nest",
  "landing",
  "carousels",
  "categories",
  "sections",
  "brands",
  "services",
  "rentals",
  "offers",
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
    tab === "categories"
      ? "carousels"
      : tab === "sections"
        ? "carousels?tab=sections"
        : tab === "homev2"
        ? "home"
        : tab && VALID.includes(tab)
          ? tab
          : "home";
  redirect(`/settings/store/${dest}`);
}
