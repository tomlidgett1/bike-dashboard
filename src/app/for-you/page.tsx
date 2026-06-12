import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function ForYouPage() {
  redirect("/marketplace?space=for-you");
}
