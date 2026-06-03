# Sign in with Apple Setup

This app uses Supabase-hosted Apple OAuth, not direct Apple JS. Apple should
return to Supabase, then Supabase returns to the app.

## Fixed Production Values

- Supabase project: `frjcluhuictnbimitvrm`
- Supabase domain: `frjcluhuictnbimitvrm.supabase.co`
- Apple Services ID domain: `frjcluhuictnbimitvrm.supabase.co`
- Apple Services ID return URL: `https://frjcluhuictnbimitvrm.supabase.co/auth/v1/callback`
- App OAuth callback allow-list URL: `https://yellowjersey.store/auth/callback`
- App sign-in redirect target: `https://yellowjersey.store/auth/callback?next=/marketplace`
- Apple Team ID: `235G724JXB`
- Apple primary App ID / Bundle ID: `com.yellowjersey`
- Apple Services ID / Supabase client ID: `yellowjerseyofficial`
- Apple Sign in with Apple Key ID: `NUYJB85MWD`

## Apple Developer Resources

Use the existing Apple resources in this order.

1. App ID.
   - Identifier: `com.yellowjersey`
   - Enable the `Sign in with Apple` capability.
   - Leave server-to-server notification URL blank.

2. Services ID.
   - Identifier: `yellowjerseyofficial`
   - This identifier is the Supabase `client_id` and the JWT `sub`.
   - Configure `Sign in with Apple` and select the primary App ID.
   - Website domain: `frjcluhuictnbimitvrm.supabase.co`
   - Return URL: `https://frjcluhuictnbimitvrm.supabase.co/auth/v1/callback`
   - Click `Done`, then save the Services ID page.

3. Sign in with Apple key.
   - Select the primary App ID `com.yellowjersey` in the key configuration.
   - Download the `.p8` file immediately. Apple only exposes it once.
   - Current Key ID: `NUYJB85MWD`

## Generate The Supabase Secret

Put the downloaded key in the project root, then run:

```sh
APPLE_CLIENT_ID=yellowjerseyofficial \
APPLE_KEY_ID=NUYJB85MWD \
APPLE_PRIVATE_KEY_PATH=/Users/user/Downloads/AuthKey_NUYJB85MWD.p8 \
node generate-apple-secret.js
```

Use the printed JWT as Supabase's Apple provider secret.

Do not use `com.yellowjersey` as `APPLE_CLIENT_ID`. That is the primary App ID.
For Supabase web OAuth, `APPLE_CLIENT_ID` must be the Services ID:
`yellowjerseyofficial`.

## Supabase Configuration

Set the Apple provider in Supabase Auth to:

- Enabled: `true`
- Client ID: `yellowjerseyofficial`
- Secret: the generated JWT

Then verify:

```sh
APPLE_CLIENT_ID=yellowjerseyofficial npm run check:apple-oauth
```

The output must show:

```json
{
  "client_id": "yellowjerseyofficial",
  "redirect_uri": "https://frjcluhuictnbimitvrm.supabase.co/auth/v1/callback",
  "response_type": "code",
  "response_mode": "form_post",
  "scope": "email name"
}
```

Only after that, enable the production button with:

```sh
NEXT_PUBLIC_ENABLE_APPLE_AUTH=true
```
