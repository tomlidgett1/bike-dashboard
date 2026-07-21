import type { InstagramPostAspect } from "@/lib/instagram/formats";

export type InstagramCampaignStatus =
  | "generating"
  | "ready"
  | "scheduled"
  | "posting"
  | "completed"
  | "cancelled"
  | "failed";

export type InstagramCampaignStyleBible = {
  mood: string;
  palette: string;
  lighting: string;
  composition: string;
  continuity: string;
};

export type InstagramCampaignDay = {
  id: string;
  dayIndex: number;
  title: string;
  narrativeRole: string;
  prompt: string;
  caption: string;
  imageUrl: string | null;
  status: string;
  scheduledAt: string | null;
  postedAt: string | null;
  permalink: string | null;
  errorMessage: string | null;
};

export type InstagramCampaign = {
  id: string;
  objective: string;
  styleBible: InstagramCampaignStyleBible;
  durationDays: 5 | 10;
  aspect: InstagramPostAspect;
  includeLogo: boolean;
  productId: string | null;
  productName: string | null;
  productImageUrl: string | null;
  startAt: string;
  status: InstagramCampaignStatus;
  lastError: string | null;
  createdAt: string;
  days: InstagramCampaignDay[];
};
