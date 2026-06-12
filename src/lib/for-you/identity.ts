import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import type { ForYouIdentity } from "./types";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Resolve who we're personalising for on the server.
 * - Logged-in: Supabase auth user (from cookies).
 * - Logged-out: the persistent yj_anon_id cookie kept in sync by the
 *   client-side interaction tracker.
 */
export async function resolveForYouIdentity(): Promise<ForYouIdentity> {
  const cookieStore = await cookies();
  const anonCookie = cookieStore.get("yj_anon_id")?.value || null;
  const anonymousId = anonCookie && UUID_RE.test(anonCookie) ? anonCookie : null;

  let userId: string | null = null;
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    userId = user?.id || null;
  } catch {
    // Auth failures degrade to anonymous personalisation.
  }

  return { userId, anonymousId };
}
