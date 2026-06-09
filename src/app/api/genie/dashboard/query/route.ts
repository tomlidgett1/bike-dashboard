import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import type {
  GenieChartPayload,
  GenieTablePayload,
} from "@/lib/genie/visual-payloads";
import type { GeniePivotTablePayload } from "@/lib/genie/pivot-table";
import type { DashboardWidgetPayload } from "@/lib/dashboard/store-dashboard";
import { mergeVisualArgsWithWidget } from "@/lib/dashboard/dashboard-query-visual";
import {
  buildSqlVisualPayload,
  clampSqlLimit,
  coerceSqlRows,
  GENIE_LIGHTSPEED_SQL_RPC,
  normalizeLightspeedReportSql,
  validateLightspeedReportSql,
  type DashboardSqlVisualType,
  type LightspeedSqlVisualArgs,
} from "@/lib/genie/lightspeed-sql-visual";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;
const AI_MODEL = "gpt-4.1-mini";

const SQL_EDIT_SYSTEM = `You rewrite Lightspeed Genie SQL for a bicycle store dashboard widget.

Rules:
- Return ONLY the SQL statement. No markdown, comments, or explanation.
- Only one SELECT or WITH query.
- Must read from genie_lightspeed_sales_report_lines and/or genie_lightspeed_inventory.
- Never use raw tables lightspeed_sales_report_lines or lightspeed_inventory.
- Never mutate data or reference secrets.
- Keep the query scoped to the store via the view (user_id is enforced server-side).
- Preserve the intent of the current query unless the instruction asks to change it.
- Use Australian English in string literals only when needed.`;

async function requireStoreUser() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { error: NextResponse.json({ error: "Unauthorised. Please log in." }, { status: 401 }) };
  }

  const { data: profile } = await supabase
    .from("users")
    .select("account_type, bicycle_store")
    .eq("user_id", user.id)
    .single();

  if (!profile || profile.account_type !== "bicycle_store" || !profile.bicycle_store) {
    return {
      error: NextResponse.json(
        { error: "Dashboard queries are only available to verified bicycle stores." },
        { status: 403 },
      ),
    };
  }

  return { userId: user.id };
}

async function executeSql(userId: string, sql: string, limit: number) {
  const admin = createServiceRoleClient();
  const { data, error } = await admin.rpc(GENIE_LIGHTSPEED_SQL_RPC, {
    p_sql: sql,
    p_user_id: userId,
    p_limit: limit,
  });

  if (error) {
    return { error: error.message };
  }

  const result = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  const rows = coerceSqlRows(result.rows);
  const rowCount = typeof result.row_count === "number" ? result.row_count : rows.length;
  const limitApplied = Boolean(result.limit_applied);

  return { rows, rowCount, limitApplied };
}

async function aiRewriteSql(currentSql: string, instruction: string, purpose: string) {
  if (!openai) {
    return { error: "AI editing is not configured on this environment." };
  }

  const response = await openai.chat.completions.create({
    model: AI_MODEL,
    temperature: 0.1,
    messages: [
      { role: "system", content: SQL_EDIT_SYSTEM },
      {
        role: "user",
        content: [
          `Purpose: ${purpose}`,
          "",
          "Current SQL:",
          currentSql,
          "",
          `Instruction: ${instruction}`,
        ].join("\n"),
      },
    ],
  });

  const rewritten = response.choices[0]?.message?.content?.trim();
  if (!rewritten) {
    return { error: "AI did not return a query." };
  }

  return { sql: normalizeLightspeedReportSql(rewritten.replace(/^```sql\s*/i, "").replace(/```$/g, "").trim()) };
}

function payloadFromVisual(
  visualData: GenieChartPayload | GenieTablePayload | GeniePivotTablePayload,
  visualType: DashboardSqlVisualType,
  title: string,
): DashboardWidgetPayload {
  if (visualType === "chart") {
    return { type: "chart", data: { ...(visualData as GenieChartPayload), title } };
  }
  if (visualType === "table") {
    return { type: "table", data: { ...(visualData as GenieTablePayload), title } };
  }
  return { type: "pivot", data: { ...(visualData as GeniePivotTablePayload), title } };
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireStoreUser();
    if ("error" in auth && auth.error) return auth.error;
    const userId = auth.userId!;

    const body = await request.json();
    const action = body?.action as "run" | "ai_edit" | undefined;
    const visualType = body?.visualType as DashboardSqlVisualType | undefined;
    const purpose = String(body?.purpose ?? "Dashboard widget query").trim();
    const instruction = String(body?.instruction ?? "").trim();
    const widgetPayload = body?.widgetPayload as DashboardWidgetPayload | undefined;
    const widgetTitle = String(body?.widgetTitle ?? "").trim();
    let sql = normalizeLightspeedReportSql(String(body?.sql ?? ""));
    const limit = clampSqlLimit(body?.limit);
    let visual = body?.visual as LightspeedSqlVisualArgs | undefined;

    if (!action || !visualType || !["chart", "table", "pivot"].includes(visualType)) {
      return NextResponse.json({ error: "Invalid dashboard query request." }, { status: 400 });
    }

    if (widgetPayload && widgetTitle) {
      visual = mergeVisualArgsWithWidget(visual, widgetPayload, widgetTitle);
    }

    if (action === "ai_edit") {
      if (!instruction) {
        return NextResponse.json({ error: "Describe what to change before using AI edit." }, { status: 400 });
      }
      if (!sql) {
        return NextResponse.json({ error: "This widget has no stored SQL to edit." }, { status: 400 });
      }

      const aiResult = await aiRewriteSql(sql, instruction, purpose);
      if ("error" in aiResult && aiResult.error) {
        return NextResponse.json({ error: aiResult.error }, { status: 500 });
      }
      sql = aiResult.sql!;
    }

    const validationError = validateLightspeedReportSql(sql);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    const execution = await executeSql(userId, sql, limit);
    if ("error" in execution && execution.error) {
      return NextResponse.json({ error: execution.error }, { status: 500 });
    }

    const visualData = buildSqlVisualPayload(
      execution.rows!,
      visual,
      visualType,
      execution.limitApplied!,
    );

    if (!visualData) {
      return NextResponse.json(
        { error: "Query ran successfully but returned no data for this widget type." },
        { status: 422 },
      );
    }

    const title =
      widgetTitle
      || (visualType === "chart" && "title" in visualData ? visualData.title : "")
      || (visualType === "table" && "title" in visualData ? visualData.title : "")
      || (visualType === "pivot" && "title" in visualData ? visualData.title : "")
      || "Dashboard widget";

    const payload = payloadFromVisual(visualData, visualType, title);

    return NextResponse.json({
      ok: true,
      sql,
      purpose,
      limit,
      visual,
      visualType,
      row_count: execution.rowCount,
      payload,
      querySource: {
        kind: "lightspeed_sql",
        sql,
        purpose,
        limit,
        visual,
        visualType,
      },
    });
  } catch (error) {
    console.error("Dashboard query error:", error);
    return NextResponse.json({ error: "Failed to run dashboard query." }, { status: 500 });
  }
}
