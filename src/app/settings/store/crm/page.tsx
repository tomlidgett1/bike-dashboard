import { redirect } from "next/navigation";
import { isStoreCrmV2Enabled } from "@/lib/crm/feature-flags";

export default function StoreCrmPage() {
  redirect(
    isStoreCrmV2Enabled()
      ? "/settings/store/crm/today"
      : "/settings/store/crm/outreach",
  );
}
