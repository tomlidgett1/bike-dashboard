import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  NEST_COMPOSE_QUICK_ACTIONS_PREFS_KEY,
  parseNestComposeQuickActions,
  resolveGoogleReviewUrl,
  serializeNestComposeQuickActions,
  type NestComposeQuickAction,
} from "@/lib/nest/compose-quick-actions";
import {
  DEFAULT_NEST_MESSAGE_INTRO,
  DEFAULT_NEST_MESSAGE_SIGNOFF,
  resolveNestMessageTemplates,
  type NestMessageTemplateSettings,
} from "@/lib/nest/message-format";

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

async function requireStoreUser() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { error: json({ error: "Unauthorised" }, 401) } as const;
  }

  const { data: profile, error: profileError } = await supabase
    .from("users")
    .select(
      "account_type, bicycle_store, business_name, phone, nest_message_intro, nest_message_signoff, preferences",
    )
    .eq("user_id", user.id)
    .maybeSingle();

  if (profileError) {
    return { error: json({ error: "Could not load store profile." }, 500) } as const;
  }

  if (profile?.account_type !== "bicycle_store" || profile?.bicycle_store !== true) {
    return { error: json({ error: "Store access required." }, 403) } as const;
  }

  return { supabase, userId: user.id, profile } as const;
}

function preferencesObject(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return { ...(raw as Record<string, unknown>) };
  }
  return {};
}

function quickActionsFromProfile(preferences: unknown): NestComposeQuickAction[] {
  const prefs = preferencesObject(preferences);
  return parseNestComposeQuickActions(prefs[NEST_COMPOSE_QUICK_ACTIONS_PREFS_KEY]);
}

function googleReviewUrlFromProfile(preferences: unknown): string | null {
  return resolveGoogleReviewUrl({
    preferences,
    envUrl:
      process.env.GOOGLE_REVIEW_URL?.trim() ||
      process.env.NEXT_PUBLIC_GOOGLE_REVIEW_URL?.trim() ||
      null,
  });
}

export async function GET() {
  const auth = await requireStoreUser();
  if ("error" in auth) return auth.error;

  const templates = resolveNestMessageTemplates({
    intro: auth.profile.nest_message_intro,
    signoff: auth.profile.nest_message_signoff,
  });

  return json({
    templates,
    defaults: {
      intro: DEFAULT_NEST_MESSAGE_INTRO,
      signoff: DEFAULT_NEST_MESSAGE_SIGNOFF,
    },
    storeName: auth.profile.business_name ?? null,
    storePhone: auth.profile.phone ?? null,
    quickActions: quickActionsFromProfile(auth.profile.preferences),
    googleReviewUrl: googleReviewUrlFromProfile(auth.profile.preferences),
  });
}

export async function PATCH(request: NextRequest) {
  const auth = await requireStoreUser();
  if ("error" in auth) return auth.error;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ error: "Invalid JSON body." }, 400);
  }

  const updates: Partial<NestMessageTemplateSettings> = {};
  let nextQuickActions: NestComposeQuickAction[] | null = null;
  let nextPreferences: Record<string, unknown> | null = null;

  if ("intro" in body) {
    if (typeof body.intro !== "string") {
      return json({ error: "Intro must be a string." }, 400);
    }
    updates.intro = body.intro.trim();
  }

  if ("signoff" in body) {
    if (typeof body.signoff !== "string") {
      return json({ error: "Signoff must be a string." }, 400);
    }
    updates.signoff = body.signoff.trim();
  }

  if ("quickActions" in body) {
    nextQuickActions = serializeNestComposeQuickActions(body.quickActions);
    nextPreferences = {
      ...preferencesObject(auth.profile.preferences),
      [NEST_COMPOSE_QUICK_ACTIONS_PREFS_KEY]: nextQuickActions,
    };
  }

  if (!("intro" in body) && !("signoff" in body) && !("quickActions" in body)) {
    return json({ error: "Nothing to update." }, 400);
  }

  const { error } = await auth.supabase
    .from("users")
    .update({
      ...("intro" in body ? { nest_message_intro: updates.intro || null } : {}),
      ...("signoff" in body ? { nest_message_signoff: updates.signoff ?? null } : {}),
      ...(nextPreferences ? { preferences: nextPreferences } : {}),
    })
    .eq("user_id", auth.userId);

  if (error) {
    console.error("[nest-settings] update failed:", error);
    return json({ error: "Could not save Nest message settings." }, 500);
  }

  const templates = resolveNestMessageTemplates({
    intro: "intro" in body ? updates.intro : auth.profile.nest_message_intro,
    signoff: "signoff" in body ? updates.signoff : auth.profile.nest_message_signoff,
  });

  return json({
    templates,
    storeName: auth.profile.business_name ?? null,
    storePhone: auth.profile.phone ?? null,
    quickActions:
      nextQuickActions ?? quickActionsFromProfile(auth.profile.preferences),
    googleReviewUrl: googleReviewUrlFromProfile(
      nextPreferences ?? auth.profile.preferences,
    ),
  });
}
