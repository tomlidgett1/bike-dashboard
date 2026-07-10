import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function StoreDashboardPage() {
  redirect("/settings/store/home");
}
