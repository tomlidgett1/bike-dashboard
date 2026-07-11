import { getAdminClient } from './supabase.ts';

export type OAuthLinkProvider = 'google' | 'microsoft' | 'granola';

interface OAuthLinkStateRow {
  id: string;
  auth_user_id: string;
  provider: OAuthLinkProvider;
  original_refresh_token: string | null;
  expires_at: string;
}

export async function createOAuthLinkState(params: {
  authUserId: string;
  provider: OAuthLinkProvider;
  originalRefreshToken?: string | null;
}): Promise<string> {
  const supabase = getAdminClient();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

  await supabase
    .from('oauth_link_states')
    .delete()
    .eq('auth_user_id', params.authUserId)
    .eq('provider', params.provider);

  const { data, error } = await supabase
    .from('oauth_link_states')
    .insert({
      auth_user_id: params.authUserId,
      provider: params.provider,
      original_refresh_token: params.originalRefreshToken ?? null,
      expires_at: expiresAt,
    })
    .select('id')
    .single();

  if (error || !data?.id) {
    throw new Error(`Failed to create OAuth link state: ${error?.message ?? 'unknown error'}`);
  }

  return data.id as string;
}

export async function consumeOAuthLinkState(
  linkStateId: string,
  provider: OAuthLinkProvider,
): Promise<{ authUserId: string; originalRefreshToken: string | null } | null> {
  const supabase = getAdminClient();
  const nowIso = new Date().toISOString();

  const { data, error } = await supabase
    .from('oauth_link_states')
    .select('id, auth_user_id, provider, original_refresh_token, expires_at')
    .eq('id', linkStateId)
    .eq('provider', provider)
    .gt('expires_at', nowIso)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to read OAuth link state: ${error.message}`);
  }
  if (!data) return null;

  await supabase.from('oauth_link_states').delete().eq('id', linkStateId);

  const row = data as OAuthLinkStateRow;
  return {
    authUserId: row.auth_user_id,
    originalRefreshToken: row.original_refresh_token,
  };
}

export async function revokeGoogleRefreshToken(refreshToken: string | null | undefined): Promise<void> {
  const token = refreshToken?.trim();
  if (!token) return;

  const response = await fetch('https://oauth2.googleapis.com/revoke', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ token }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Google token revoke failed (${response.status}): ${body.slice(0, 160)}`);
  }
}
