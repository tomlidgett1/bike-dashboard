import { permanentRedirect } from "next/navigation";

export const dynamic = 'force-dynamic';

// The home experience lives at /marketplace. Middleware already issues a
// permanent (308) redirect for `/` before this renders; this is the matching
// permanent redirect for any path that reaches the page directly, so search
// engines always see a 308 and consolidate the root domain's authority onto
// the canonical home.
export default function Home() {
  permanentRedirect("/marketplace");
}
