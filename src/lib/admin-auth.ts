import { NextResponse } from 'next/server';

type AuthUser = {
  email?: string | null;
};

type SupabaseAuthClient = {
  auth: {
    getUser: () => Promise<{
      data: { user: AuthUser | null };
      error: unknown;
    }>;
  };
};

function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS || 'tom@lidgett.net')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(email?: string | null): boolean {
  return Boolean(email && adminEmails().includes(email.toLowerCase()));
}

export async function requireAdminAccess(supabase: SupabaseAuthClient) {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return {
      authorized: false as const,
      response: NextResponse.json({ error: 'Unauthorised' }, { status: 401 }),
    };
  }

  if (!isAdminEmail(user.email)) {
    return {
      authorized: false as const,
      response: NextResponse.json({ error: 'Forbidden - Admin only' }, { status: 403 }),
    };
  }

  return { authorized: true as const, user };
}
