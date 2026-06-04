import { redirect } from "next/navigation";

// Renamed to Carousels — keep old URL working.
export default function StoreCategoriesRedirect() {
  redirect("/settings/store/carousels");
}
