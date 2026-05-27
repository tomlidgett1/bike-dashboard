import { Suspense } from "react";
import { AuthCallbackHandler } from "./auth-callback-handler";

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 p-4">
          <p className="text-sm text-gray-600">Signing you in…</p>
        </div>
      }
    >
      <AuthCallbackHandler />
    </Suspense>
  );
}
