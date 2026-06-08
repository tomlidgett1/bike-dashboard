import { redirect } from "next/navigation";

export default function StoreSectionsPage() {
  redirect("/settings/store/carousels?tab=sections");
}
