"use client";

import { useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Completes Google/Apple OAuth on the client so the PKCE code_verifier cookie
 * (set in the browser during signInWithOAuth) is available for exchange.
 * Server route handlers often miss that cookie on localhost (port/host drift).
 */
export function AuthCallbackHandler() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const run = async () => {
      const errorParam = searchParams.get("error");
      const errorDescription = searchParams.get("error_description");
      if (errorParam) {
        const url = new URL("/auth/auth-code-error", window.location.origin);
        url.searchParams.set("error", errorParam);
        if (errorDescription) {
          url.searchParams.set("error_description", errorDescription);
        }
        router.replace(url.pathname + url.search);
        return;
      }

      const code = searchParams.get("code");
      let next = searchParams.get("next") ?? "/marketplace";
      if (!next.startsWith("/")) {
        next = "/marketplace";
      }

      if (!code) {
        router.replace("/auth/auth-code-error?reason=no_code");
        return;
      }

      const supabase = createClient();
      const { data, error } = await supabase.auth.exchangeCodeForSession(code);

      if (error || !data.session) {
        const url = new URL("/auth/auth-code-error", window.location.origin);
        url.searchParams.set("reason", "exchange_failed");
        if (error?.message) {
          url.searchParams.set("details", error.message);
        }
        router.replace(url.pathname + url.search);
        return;
      }

      router.replace(next);
      router.refresh();
    };

    void run();
  }, [router, searchParams]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 p-4">
      <p className="text-sm text-gray-600">Signing you in…</p>
    </div>
  );
}
