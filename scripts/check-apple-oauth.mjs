const supabaseUrl = (
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://frjcluhuictnbimitvrm.supabase.co"
).replace(/\\n/g, "").replace(/\/$/, "");
const appUrl = (
  process.env.NEXT_PUBLIC_SITE_URL ??
  process.env.NEXT_PUBLIC_APP_URL ??
  "https://yellowjersey.store"
).replace(/\\n/g, "").replace(/\/$/, "");
const expectedClientId = process.env.APPLE_CLIENT_ID;

const redirectTo = `${appUrl}/auth/callback?next=/marketplace`;
const authorizeUrl = new URL("/auth/v1/authorize", supabaseUrl);
authorizeUrl.searchParams.set("provider", "apple");
authorizeUrl.searchParams.set("redirect_to", redirectTo);

const response = await fetch(authorizeUrl, { redirect: "manual" });
const location = response.headers.get("location");

console.log(`Supabase authorize status: ${response.status}`);

if (!location) {
  console.error(await response.text());
  process.exit(1);
}

const appleUrl = new URL(location);
const actual = {
  client_id: appleUrl.searchParams.get("client_id"),
  redirect_uri: appleUrl.searchParams.get("redirect_uri"),
  response_type: appleUrl.searchParams.get("response_type"),
  response_mode: appleUrl.searchParams.get("response_mode"),
  scope: appleUrl.searchParams.get("scope"),
};

console.log(JSON.stringify(actual, null, 2));

const expectedRedirectUri = `${supabaseUrl}/auth/v1/callback`;
const failures = [];

if (actual.redirect_uri !== expectedRedirectUri) {
  failures.push(`Expected redirect_uri ${expectedRedirectUri}, got ${actual.redirect_uri}`);
}

if (expectedClientId && actual.client_id !== expectedClientId) {
  failures.push(`Expected client_id ${expectedClientId}, got ${actual.client_id}`);
}

if (failures.length > 0) {
  console.error(`\nApple OAuth check failed:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}

console.log("\nApple OAuth redirect contract is valid from the app/Supabase side.");
