import Link from "next/link";

type Props = {
  searchParams: Promise<{
    error?: string;
    error_description?: string;
    reason?: string;
    details?: string;
  }>;
};

export default async function AuthCodeErrorPage({ searchParams }: Props) {
  const q = await searchParams;
  const error = q.error;
  const errorDescription = q.error_description;
  const reason = q.reason;
  const details = q.details;
  const invalidApiKey =
    typeof details === "string" && /invalid api key/i.test(details);
  const pkceVerifierMissing =
    typeof details === "string" &&
    /code verifier|auth code and code verifier/i.test(details);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-md rounded-md border border-gray-200 bg-white p-6 shadow-sm">
        <h1 className="text-lg font-semibold text-gray-900">
          Sign-in could not be completed
        </h1>
        <p className="mt-2 text-sm text-gray-600">
          Something went wrong while finishing Google sign-in. You can try again
          from the marketplace.
        </p>
        {pkceVerifierMissing && (
          <div className="mt-4 rounded-md border border-gray-200 bg-white p-4 text-sm text-gray-800">
            <p className="font-medium text-gray-900">Local dev (localhost)</p>
            <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-gray-700">
              <li>
                Use one URL for the whole flow — e.g. always{" "}
                <code className="rounded bg-gray-100 px-1">http://localhost:3000</code>{" "}
                (not 3002 one time and 3000 the next).
              </li>
              <li>
                In Supabase → Authentication → URL configuration, add redirect URLs for
                each port you use, e.g.{" "}
                <code className="rounded bg-gray-100 px-1">
                  http://localhost:3000/auth/callback
                </code>
                .
              </li>
              <li>
                Clear site cookies for localhost, then try sign-in again from the same tab.
              </li>
            </ol>
          </div>
        )}
        {invalidApiKey && (
          <div className="mt-4 rounded-md border border-gray-200 bg-white p-4 text-sm text-gray-800">
            <p className="font-medium text-gray-900">Fix on Vercel (production)</p>
            <p className="mt-2 text-gray-600">
              The anon key in your deployment does not match your Supabase project URL.
              Both must come from the{" "}
              <span className="font-medium">same</span> project (the one that owns
              your Google OAuth callback).
            </p>
            <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-gray-700">
              <li>
                Supabase → Project → Settings → API: copy{" "}
                <span className="font-medium">Project URL</span> and the{" "}
                <span className="font-medium">anon public</span> key (JWT starting with{" "}
                <code className="rounded bg-gray-100 px-1">eyJ</code>).
              </li>
              <li>
                Vercel → your app → Settings → Environment Variables (Production): set{" "}
                <code className="rounded bg-gray-100 px-1">
                  NEXT_PUBLIC_SUPABASE_URL
                </code>{" "}
                and{" "}
                <code className="rounded bg-gray-100 px-1">
                  NEXT_PUBLIC_SUPABASE_ANON_KEY
                </code>{" "}
                to those values. No spaces or line breaks.
              </li>
              <li>
                Redeploy — <span className="font-medium">NEXT_PUBLIC_*</span> is baked
                in at build time.
              </li>
            </ol>
            <p className="mt-3 text-xs text-gray-600">
              Do not use the service role key in{" "}
              <code className="rounded bg-gray-100 px-0.5">
                NEXT_PUBLIC_SUPABASE_ANON_KEY
              </code>
              .
            </p>
          </div>
        )}
        {(error || reason) && (
          <div className="mt-4 rounded-md border border-gray-100 bg-gray-50 p-3 text-xs text-gray-700">
            {error && (
              <p>
                <span className="font-medium">Error:</span> {error}
              </p>
            )}
            {errorDescription && (
              <p className="mt-1 text-gray-600">{errorDescription}</p>
            )}
            {reason && (
              <p className={error ? "mt-2" : ""}>
                <span className="font-medium">Reason:</span> {reason}
              </p>
            )}
            {details && (
              <p className="mt-1 break-words text-gray-600">{details}</p>
            )}
          </div>
        )}
        <div className="mt-6 flex flex-col gap-2 sm:flex-row">
          <Link
            href="/marketplace"
            className="inline-flex items-center justify-center rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
          >
            Back to marketplace
          </Link>
          <Link
            href="/marketplace"
            className="inline-flex items-center justify-center rounded-md border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50"
          >
            Try sign in again
          </Link>
        </div>
      </div>
    </div>
  );
}
