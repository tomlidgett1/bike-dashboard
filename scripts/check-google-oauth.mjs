/**
 * Verifies the Google + Supabase OAuth path used from localhost.
 * Exits 1 if Google returns redirect_uri_mismatch (Google Cloud config).
 *
 * Run: node --env-file=.env.local scripts/check-google-oauth.mjs
 */
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !anonKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");
  process.exit(1);
}

const requiredSupabaseCallback = new URL("auth/v1/callback", supabaseUrl).href;

const supabase = createClient(supabaseUrl, anonKey);
const { data, error } = await supabase.auth.signInWithOAuth({
  provider: "google",
  options: {
    skipBrowserRedirect: true,
    redirectTo: "http://127.0.0.1:3005/auth/callback?next=/marketplace",
  },
});

if (error) {
  console.error("Supabase signInWithOAuth error:", error.message);
  process.exit(1);
}

const r1 = await fetch(data.url, { redirect: "manual" });
if (r1.status < 300 || r1.status >= 400) {
  console.error("Unexpected response from Supabase authorize:", r1.status);
  process.exit(1);
}

const googleLocation = r1.headers.get("location");
if (!googleLocation) {
  console.error("No Location header from Supabase → Google");
  process.exit(1);
}

const google = new URL(googleLocation);
const clientId = google.searchParams.get("client_id");
const redirectUri = google.searchParams.get("redirect_uri");

console.log("--- Google Cloud Console fix ---");
console.log("OAuth 2.0 Client ID:", clientId);
console.log("Add this EXACT Authorised redirect URI (Web client):");
console.log("  ", redirectUri);
console.log("(Must match required Supabase callback:)");
console.log("  ", requiredSupabaseCallback);
console.log("");

if (redirectUri !== requiredSupabaseCallback) {
  console.error("Mismatch: query redirect_uri != constructed callback URL (unexpected).");
  process.exit(1);
}

const r2 = await fetch(googleLocation, { redirect: "manual" });
const next =
  r2.status >= 300 && r2.status < 400 && r2.headers.get("location")
    ? r2.headers.get("location")
    : googleLocation;
const page = await fetch(next).then((res) => res.text());
const bad = page.includes("redirect_uri_mismatch") || page.includes("invalid_request");

if (bad) {
  console.log("CHECK RESULT: Google returns redirect_uri_mismatch for this client.");
  console.log("Open: Google Cloud Console → APIs & Services → Credentials");
  console.log("→ your OAuth 2.0 Client ID (Web application) → Authorised redirect URIs");
  console.log("→ add the line above, save, wait 1–5 minutes, try again.");
  process.exit(1);
}

console.log("CHECK RESULT: No redirect_uri_mismatch in fetched Google error page (OK).");
process.exit(0);
