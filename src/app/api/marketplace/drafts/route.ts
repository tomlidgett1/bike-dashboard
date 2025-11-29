import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// ============================================================
// GET /api/marketplace/drafts - Get all drafts for current user
// ============================================================

export async function GET() {
  try {
    const supabase = await createClient();
    
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { data: drafts, error } = await supabase
      .from("listing_drafts")
      .select("*")
      .eq("user_id", user.id)
      .eq("completed", false)
      .order("last_saved_at", { ascending: false });

    if (error) {
      console.error("Error fetching drafts:", error);
      return NextResponse.json(
        { error: "Failed to fetch drafts" },
        { status: 500 }
      );
    }

    return NextResponse.json({ drafts });
  } catch (error) {
    console.error("Error in GET /api/marketplace/drafts:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// ============================================================
// POST /api/marketplace/drafts - Save/update a draft
// ============================================================

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { draftId, formData, currentStep, draftName } = body;

    if (!formData) {
      return NextResponse.json(
        { error: "Form data is required" },
        { status: 400 }
      );
    }

    let result;

    if (draftId) {
      // Update existing draft
      const { data, error } = await supabase
        .from("listing_drafts")
        .update({
          form_data: formData,
          current_step: currentStep || 1,
          draft_name: draftName,
          last_saved_at: new Date().toISOString(),
        })
        .eq("id", draftId)
        .eq("user_id", user.id)
        .select()
        .single();

      if (error) {
        console.error("Error updating draft:", error);
        return NextResponse.json(
          { error: "Failed to update draft" },
          { status: 500 }
        );
      }

      result = data;
    } else {
      // Create new draft
      const { data, error } = await supabase
        .from("listing_drafts")
        .insert({
          user_id: user.id,
          form_data: formData,
          current_step: currentStep || 1,
          draft_name: draftName || generateDraftName(formData),
          last_saved_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) {
        console.error("Error creating draft:", error);
        return NextResponse.json(
          { error: "Failed to create draft" },
          { status: 500 }
        );
      }

      result = data;
    }

    return NextResponse.json({ draft: result });
  } catch (error) {
    console.error("Error in POST /api/marketplace/drafts:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// ============================================================
// Helper Functions
// ============================================================

function generateDraftName(formData: any): string {
  const parts = [];
  
  if (formData.brand) parts.push(formData.brand);
  if (formData.model) parts.push(formData.model);
  if (formData.modelYear) parts.push(formData.modelYear);
  
  if (parts.length > 0) {
    return parts.join(" ");
  }
  
  // Fallback
  const itemType = formData.itemType || "item";
  const date = new Date().toLocaleDateString();
  return `${itemType} - ${date}`;
}

