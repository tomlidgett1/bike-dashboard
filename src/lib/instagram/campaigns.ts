import OpenAI from "openai";
import type {
  InstagramCampaign,
  InstagramCampaignDay,
  InstagramCampaignStyleBible,
  InstagramCampaignStatus,
} from "@/lib/instagram/campaign-types";
import type { InstagramPostAspect } from "@/lib/instagram/formats";
import { createServiceRoleClient } from "@/lib/supabase/server";

const CAMPAIGN_MODEL =
  process.env.INSTAGRAM_CAMPAIGN_MODEL?.trim() || "gpt-4.1-mini";

const PLAN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["style_bible", "days"],
  properties: {
    style_bible: {
      type: "object",
      additionalProperties: false,
      required: ["mood", "palette", "lighting", "composition", "continuity"],
      properties: {
        mood: { type: "string" },
        palette: { type: "string" },
        lighting: { type: "string" },
        composition: { type: "string" },
        continuity: { type: "string" },
      },
    },
    days: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "narrative_role", "image_prompt", "caption"],
        properties: {
          title: { type: "string" },
          narrative_role: { type: "string" },
          image_prompt: { type: "string" },
          caption: { type: "string" },
        },
      },
    },
  },
} as const;

type PlanOutput = {
  style_bible: InstagramCampaignStyleBible;
  days: Array<{
    title: string;
    narrative_role: string;
    image_prompt: string;
    caption: string;
  }>;
};

type CampaignRow = {
  id: string;
  objective: string;
  style_bible: InstagramCampaignStyleBible;
  duration_days: number;
  aspect: InstagramPostAspect;
  include_logo: boolean;
  product_id: string | null;
  product_name: string | null;
  product_image_url: string | null;
  start_at: string;
  status: InstagramCampaignStatus;
  last_error: string | null;
  created_at: string;
};

type CampaignPostRow = {
  id: string;
  campaign_id: string | null;
  day_index: number | null;
  prompt: string | null;
  caption: string;
  image_url: string | null;
  status: string;
  scheduled_at: string | null;
  posted_at: string | null;
  permalink: string | null;
  error_message: string | null;
};

function getOpenAI() {
  const apiKey =
    process.env.OPENAI_API_KEY?.trim() || process.env.NEST_OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured.");
  return new OpenAI({ apiKey });
}

function clean(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function parsePlan(text: string, durationDays: 5 | 10): PlanOutput {
  const parsed = JSON.parse(text) as Partial<PlanOutput>;
  if (!parsed.style_bible || !Array.isArray(parsed.days)) {
    throw new Error("The campaign planner returned an incomplete plan.");
  }
  if (parsed.days.length !== durationDays) {
    throw new Error(
      `The campaign planner returned ${parsed.days.length} days instead of ${durationDays}.`,
    );
  }

  const styleBible: InstagramCampaignStyleBible = {
    mood: clean(parsed.style_bible.mood, 500),
    palette: clean(parsed.style_bible.palette, 500),
    lighting: clean(parsed.style_bible.lighting, 500),
    composition: clean(parsed.style_bible.composition, 700),
    continuity: clean(parsed.style_bible.continuity, 700),
  };
  if (Object.values(styleBible).some((value) => !value)) {
    throw new Error("The campaign planner returned an incomplete visual direction.");
  }

  const days = parsed.days.map((day, index) => {
    const result = {
      title: clean(day.title, 120),
      narrative_role: clean(day.narrative_role, 200),
      image_prompt: clean(day.image_prompt, 2200),
      caption: clean(day.caption, 2200),
    };
    if (Object.values(result).some((value) => !value)) {
      throw new Error(`The campaign planner returned an incomplete day ${index + 1}.`);
    }
    return result;
  });

  return { style_bible: styleBible, days };
}

export async function planInstagramCampaign(params: {
  objective: string;
  durationDays: 5 | 10;
  storeName?: string | null;
  storeUsername?: string | null;
  includeLogo: boolean;
  productFacts?: string | null;
}): Promise<PlanOutput> {
  const productFacts = params.productFacts?.trim() || "";
  const response = await getOpenAI().responses.create({
    model: CAMPAIGN_MODEL,
    instructions: [
      "You are the campaign creative director for an Australian bicycle store.",
      `Create exactly ${params.durationDays} daily Instagram feed posts that tell one coherent story.`,
      "Use Australian English. Each day must advance the narrative rather than repeat the same idea.",
      "Sequence the campaign from a strong hook, through useful human detail, to a clear final payoff.",
      "The visual style bible must be specific enough to keep separately generated images consistent.",
      "Image prompts must describe real, photographic scenes with people, bicycles, products or the store environment as appropriate.",
      "Do not add floating graphics, detached labels, phone frames, UI, watermarks, or invented claims.",
      productFacts
        ? "When mentioning prices or discounts, use only the product facts provided. Use the product description to inform captions and image briefs."
        : "Do not invent prices.",
      params.includeLogo
        ? "The store logo will be supplied as an image reference. Describe a natural in-scene use where appropriate, without making every day logo-dominant."
        : "Do not request logos or invented brand marks.",
      "Captions should be warm, confident and retail-friendly: 1 to 3 short sentences, then 3 to 6 relevant hashtags.",
      "Return only the required JSON.",
    ].join(" "),
    text: {
      format: {
        type: "json_schema",
        name: "instagram_campaign_plan",
        strict: true,
        schema: PLAN_SCHEMA,
      },
    },
    input: JSON.stringify({
      objective: params.objective,
      campaign_days: params.durationDays,
      store_name: params.storeName || null,
      instagram_handle: params.storeUsername || null,
      product_facts: productFacts || null,
    }),
  });

  return parsePlan(response.output_text, params.durationDays);
}

function mapDay(row: CampaignPostRow): InstagramCampaignDay {
  const prompt = row.prompt || "";
  const titleMatch = prompt.match(/^Campaign day title:\s*(.+)$/m);
  const roleMatch = prompt.match(/^Narrative role:\s*(.+)$/m);
  const imagePromptMatch = prompt.match(
    /^Day-specific image brief:\s*([\s\S]*?)(?:\nShared visual direction:|$)/m,
  );
  return {
    id: row.id,
    dayIndex: row.day_index || 0,
    title: titleMatch?.[1]?.trim() || `Day ${row.day_index || ""}`.trim(),
    narrativeRole: roleMatch?.[1]?.trim() || "",
    prompt: imagePromptMatch?.[1]?.trim() || prompt,
    caption: row.caption,
    imageUrl: row.image_url,
    status: row.status,
    scheduledAt: row.scheduled_at,
    postedAt: row.posted_at,
    permalink: row.permalink,
    errorMessage: row.error_message,
  };
}

function mapCampaign(
  row: CampaignRow,
  postRows: CampaignPostRow[],
): InstagramCampaign {
  return {
    id: row.id,
    objective: row.objective,
    styleBible: row.style_bible,
    durationDays: row.duration_days as 5 | 10,
    aspect: row.aspect,
    includeLogo: row.include_logo,
    productId: row.product_id,
    productName: row.product_name,
    productImageUrl: row.product_image_url,
    startAt: row.start_at,
    status: row.status,
    lastError: row.last_error,
    createdAt: row.created_at,
    days: postRows
      .filter((post) => post.campaign_id === row.id)
      .sort((a, b) => (a.day_index || 0) - (b.day_index || 0))
      .map(mapDay),
  };
}

export async function listInstagramCampaigns(
  ownerUserId: string,
  limit = 20,
): Promise<InstagramCampaign[]> {
  const admin = createServiceRoleClient();
  const { data: campaigns, error } = await admin
    .from("store_instagram_campaigns")
    .select(
      "id, objective, style_bible, duration_days, aspect, include_logo, product_id, product_name, product_image_url, start_at, status, last_error, created_at",
    )
    .eq("user_id", ownerUserId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`Could not load campaigns: ${error.message}`);
  if (!campaigns?.length) return [];

  const ids = campaigns.map((campaign) => campaign.id as string);
  const { data: posts, error: postsError } = await admin
    .from("store_instagram_posts")
    .select(
      "id, campaign_id, day_index, prompt, caption, image_url, status, scheduled_at, posted_at, permalink, error_message",
    )
    .in("campaign_id", ids)
    .order("day_index", { ascending: true });
  if (postsError) throw new Error(`Could not load campaign days: ${postsError.message}`);

  return (campaigns as CampaignRow[]).map((campaign) =>
    mapCampaign(campaign, (posts || []) as CampaignPostRow[]),
  );
}

export async function getInstagramCampaign(
  ownerUserId: string,
  campaignId: string,
): Promise<InstagramCampaign | null> {
  const campaigns = await listInstagramCampaigns(ownerUserId, 50);
  return campaigns.find((campaign) => campaign.id === campaignId) || null;
}

export async function createInstagramCampaign(params: {
  ownerUserId: string;
  objective: string;
  durationDays: 5 | 10;
  aspect: InstagramPostAspect;
  includeLogo: boolean;
  startAt: string;
  storeName?: string | null;
  storeUsername?: string | null;
  productId?: string | null;
  productName?: string | null;
  productImageUrl?: string | null;
  productFacts?: string | null;
}): Promise<InstagramCampaign> {
  const admin = createServiceRoleClient();
  const plan = await planInstagramCampaign({
    ...params,
    objective: params.productFacts
      ? `${params.objective}\n\nFeatured product facts:\n${params.productFacts}`
      : params.productName
        ? `${params.objective}\nFeatured product: ${params.productName}`
        : params.objective,
  });

  const { data: campaign, error } = await admin
    .from("store_instagram_campaigns")
    .insert({
      user_id: params.ownerUserId,
      objective: params.objective,
      style_bible: plan.style_bible,
      duration_days: params.durationDays,
      destination: "post",
      aspect: params.aspect,
      include_logo: params.includeLogo,
      product_id: params.productId || null,
      product_name: params.productName || null,
      product_image_url: params.productImageUrl || null,
      start_at: params.startAt,
      status: "generating",
    })
    .select("id")
    .single();
  if (error || !campaign) {
    throw new Error(`Could not save campaign: ${error?.message || "unknown error"}`);
  }

  const campaignId = campaign.id as string;
  const dayRows = plan.days.map((day, index) => ({
    user_id: params.ownerUserId,
    campaign_id: campaignId,
    day_index: index + 1,
    prompt: [
      `Campaign day title: ${day.title}`,
      `Narrative role: ${day.narrative_role}`,
      `Day-specific image brief: ${day.image_prompt}`,
      `Shared visual direction: ${JSON.stringify(plan.style_bible)}`,
      `Campaign objective: ${params.objective}`,
    ].join("\n"),
    caption: day.caption,
    image_url: null,
    status: "draft",
    destination: "post",
    aspect: params.aspect,
  }));

  const { error: daysError } = await admin
    .from("store_instagram_posts")
    .insert(dayRows);
  if (daysError) {
    await admin.from("store_instagram_campaigns").delete().eq("id", campaignId);
    throw new Error(`Could not save campaign days: ${daysError.message}`);
  }

  const created = await getInstagramCampaign(params.ownerUserId, campaignId);
  if (!created) throw new Error("Could not reload the campaign.");
  return created;
}

export async function updateInstagramCampaignStatus(params: {
  campaignId: string;
  ownerUserId: string;
  status: InstagramCampaignStatus;
  lastError?: string | null;
}) {
  const admin = createServiceRoleClient();
  const { error } = await admin
    .from("store_instagram_campaigns")
    .update({
      status: params.status,
      last_error: params.lastError ?? null,
    })
    .eq("id", params.campaignId)
    .eq("user_id", params.ownerUserId);
  if (error) throw new Error(`Could not update campaign: ${error.message}`);
}

export async function syncInstagramCampaignStatus(campaignId: string) {
  const admin = createServiceRoleClient();
  const { data: posts, error } = await admin
    .from("store_instagram_posts")
    .select("status, image_url")
    .eq("campaign_id", campaignId);
  if (error) throw new Error(`Could not inspect campaign posts: ${error.message}`);
  if (!posts?.length) return;

  const statuses = posts.map((post) => String(post.status));
  let status: InstagramCampaignStatus;
  if (statuses.every((value) => value === "posted")) {
    status = "completed";
  } else if (statuses.some((value) => value === "scheduled" || value === "processing")) {
    status = "posting";
  } else if (statuses.some((value) => value === "failed")) {
    status = "failed";
  } else if (statuses.every((value) => value === "draft")) {
    status = posts.every((post) => Boolean(post.image_url)) ? "ready" : "generating";
  } else {
    return;
  }

  await admin
    .from("store_instagram_campaigns")
    .update({ status })
    .eq("id", campaignId)
    .neq("status", "cancelled");
}

export function campaignImagePrompt(params: {
  objective: string;
  styleBible: InstagramCampaignStyleBible;
  day: InstagramCampaignDay;
}): string {
  return [
    `Campaign objective: ${params.objective}`,
    `Campaign day title: ${params.day.title}`,
    `Campaign day number: ${params.day.dayIndex}`,
    `Narrative role: ${params.day.narrativeRole}`,
    `Day-specific image brief: ${params.day.prompt}`,
    "Shared visual direction. Apply this consistently across the full series:",
    `Mood: ${params.styleBible.mood}`,
    `Palette: ${params.styleBible.palette}`,
    `Lighting: ${params.styleBible.lighting}`,
    `Composition: ${params.styleBible.composition}`,
    `Continuity: ${params.styleBible.continuity}`,
    "Make this image distinct for its day while clearly belonging to the same campaign.",
  ].join("\n");
}
