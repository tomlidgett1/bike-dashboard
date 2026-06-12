import { Suspense } from "react";
import { resolveForYouIdentity } from "@/lib/for-you/identity";
import { getForYouFeed } from "@/lib/for-you/engine";
import { ForYouContent, ForYouSkeleton } from "./for-you-content";

// Identity comes from cookies (auth session + yj_anon_id), so this page is
// always dynamic. The deterministic feed builds fast and streams in; the LLM
// pass runs client-initiated after first paint and never blocks rendering.
export const dynamic = "force-dynamic";

async function ForYouFeedFetcher() {
  const identity = await resolveForYouIdentity();
  const feed = await getForYouFeed(identity);
  return <ForYouContent initialFeed={feed} hadIdentity={!!(identity.userId || identity.anonymousId)} />;
}

export default function ForYouPage() {
  return (
    <Suspense fallback={<ForYouSkeleton />}>
      <ForYouFeedFetcher />
    </Suspense>
  );
}
