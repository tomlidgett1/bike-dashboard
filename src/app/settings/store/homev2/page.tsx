import { HomeV2Chat } from "./homev2-chat";

export const dynamic = "force-dynamic";

function getTodayLabel() {
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Brisbane",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());
}

export default function StoreHomeV2Page() {
  return <HomeV2Chat todayLabel={getTodayLabel()} />;
}
