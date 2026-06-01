import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

// Admin client bypasses email confirmation
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

export async function POST(request: NextRequest) {
  try {
    const { email, password, firstName, lastName } = await request.json();

    if (!email || !password) {
      return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
    }

    // Create user with email pre-confirmed — no verification email sent
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        first_name: firstName ?? "",
        last_name: lastName ?? "",
        full_name: `${firstName ?? ""} ${lastName ?? ""}`.trim(),
      },
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // Update the users profile row (created by DB trigger) with name fields
    if (data.user) {
      await supabaseAdmin
        .from("users")
        .update({
          first_name: firstName ?? "",
          last_name: lastName ?? "",
          name: `${firstName ?? ""} ${lastName ?? ""}`.trim(),
          account_type: "individual",
        })
        .eq("user_id", data.user.id);
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}
