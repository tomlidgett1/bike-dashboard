import type { ToolContract } from './types.ts';
import { getOptionalEnv } from '../env.ts';

const YOUTUBE_SEARCH_TIMEOUT_MS = 15_000;
const YOUTUBE_SEARCH_API_BASE = 'https://www.googleapis.com/youtube/v3/search';
const YOUTUBE_VIDEOS_API_BASE = 'https://www.googleapis.com/youtube/v3/videos';
const YOUTUBE_OEMBED_API_BASE = 'https://www.youtube.com/oembed';
const MAX_RESULTS = 8;
const DEFAULT_AVAILABILITY_REGION = 'AU';

interface YouTubeSnippet {
  title: string;
  channelTitle: string;
  description: string;
  publishedAt: string;
}

interface YouTubeItem {
  id: { videoId: string };
  snippet: YouTubeSnippet;
}

interface YouTubeSearchResponse {
  items: YouTubeItem[];
}

interface YouTubeVideoStatus {
  privacyStatus?: string;
  uploadStatus?: string;
  embeddable?: boolean;
}

interface YouTubeRegionRestriction {
  allowed?: string[];
  blocked?: string[];
}

interface YouTubeContentDetails {
  regionRestriction?: YouTubeRegionRestriction;
}

interface YouTubeVideoSnippet {
  liveBroadcastContent?: string;
}

interface YouTubeVideoItem {
  id: string;
  status?: YouTubeVideoStatus;
  contentDetails?: YouTubeContentDetails;
  snippet?: YouTubeVideoSnippet;
}

interface YouTubeVideosResponse {
  items: YouTubeVideoItem[];
}

function formatDuration(publishedAt: string): string {
  try {
    const date = new Date(publishedAt);
    const year = date.getFullYear();
    const month = date.toLocaleString('en-AU', { month: 'short' });
    return `${month} ${year}`;
  } catch {
    return '';
  }
}

function isVideoAllowedInRegion(
  restriction: YouTubeRegionRestriction | undefined,
  regionCode: string,
): boolean {
  if (!restriction) return true;

  const blocked = restriction.blocked ?? [];
  if (blocked.includes(regionCode)) return false;

  const allowed = restriction.allowed ?? [];
  if (allowed.length > 0 && !allowed.includes(regionCode)) return false;

  return true;
}

export function isLikelyAvailableYoutubeVideo(
  item: YouTubeVideoItem | undefined,
  regionCode = DEFAULT_AVAILABILITY_REGION,
): boolean {
  if (!item) return false;

  const privacyStatus = item.status?.privacyStatus?.toLowerCase();
  if (privacyStatus && privacyStatus !== 'public') return false;

  const uploadStatus = item.status?.uploadStatus?.toLowerCase();
  if (uploadStatus && uploadStatus !== 'processed') return false;

  if (item.status?.embeddable === false) return false;

  const liveBroadcastContent = item.snippet?.liveBroadcastContent?.toLowerCase();
  if (liveBroadcastContent === 'live' || liveBroadcastContent === 'upcoming') {
    return false;
  }

  return isVideoAllowedInRegion(item.contentDetails?.regionRestriction, regionCode);
}

async function fetchYoutubeVideoDetails(
  apiKey: string,
  videoIds: string[],
): Promise<Map<string, YouTubeVideoItem>> {
  if (videoIds.length === 0) return new Map();

  const url = new URL(YOUTUBE_VIDEOS_API_BASE);
  url.searchParams.set('part', 'status,contentDetails,snippet');
  url.searchParams.set('id', videoIds.join(','));
  url.searchParams.set('key', apiKey);

  const response = await fetch(url.toString(), {
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `details ${response.status}: ${errorText.substring(0, 200)}`,
    );
  }

  const data = (await response.json()) as YouTubeVideosResponse;
  return new Map((data.items ?? []).map((item) => [item.id, item]));
}

async function passesOEmbedAvailability(videoId: string): Promise<boolean> {
  const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const url = new URL(YOUTUBE_OEMBED_API_BASE);
  url.searchParams.set('url', watchUrl);
  url.searchParams.set('format', 'json');

  try {
    const response = await fetch(url.toString(), {
      headers: { Accept: 'application/json' },
    });
    return response.ok;
  } catch {
    return false;
  }
}

export const youtubeSearchTool: ToolContract = {
  name: 'youtube_search',
  description:
    'Search YouTube for high-quality, relevant videos on a topic. Use this when the user explicitly asks for a YouTube video, tutorial, or "show me a video about X". Also use proactively when the user has asked multiple questions about the same topic and a great video would genuinely help them learn or explore further. Always pick videos that are world-class, highly relevant, and from credible creators.',
  namespace: 'youtube.search',
  sideEffect: 'read',
  idempotent: true,
  timeoutMs: YOUTUBE_SEARCH_TIMEOUT_MS,
  inputSchema: {
    type: 'object' as const,
    properties: {
      query: {
        type: 'string' as const,
        description:
          'The search query for YouTube. Be specific and targeted — include the topic, format (e.g. "tutorial", "explained", "beginner guide"), and any relevant context (e.g. "Python decorators tutorial 2024").',
      },
      topic_context: {
        type: 'string' as const,
        description:
          'Optional: a brief description of what the user has been discussing, to help frame the search for the most useful video (e.g. "user has been asking about machine learning basics for 4 turns").',
      },
    },
    required: ['query'],
  },
  handler: async (input, _ctx) => {
    const query = (input.query as string)?.trim() ?? '';
    if (!query) {
      return { content: 'No search query provided.' };
    }

    const apiKey = getOptionalEnv('GOOGLE_MAPS_API_KEY');
    if (!apiKey) {
      console.warn('[youtube_search] GOOGLE_MAPS_API_KEY not set');
      return {
        content:
          'YouTube search is not configured. Please ask the user to share a YouTube link directly, or try a web search instead.',
      };
    }

    const url = new URL(YOUTUBE_SEARCH_API_BASE);
    url.searchParams.set('part', 'snippet');
    url.searchParams.set('q', query);
    url.searchParams.set('type', 'video');
    url.searchParams.set('maxResults', String(MAX_RESULTS));
    url.searchParams.set('order', 'relevance');
    url.searchParams.set('videoEmbeddable', 'true');
    url.searchParams.set('videoSyndicated', 'true');
    url.searchParams.set('videoDefinition', 'high');
    url.searchParams.set('key', apiKey);

    console.log(`[youtube_search] searching: "${query}"`);

    let data: YouTubeSearchResponse;
    try {
      const response = await fetch(url.toString(), {
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[youtube_search] API error ${response.status}: ${errorText.substring(0, 200)}`);
        return { content: `YouTube search failed (${response.status}). Try again shortly.` };
      }
      data = (await response.json()) as YouTubeSearchResponse;
    } catch (err) {
      console.error('[youtube_search] fetch failed:', (err as Error).message);
      return { content: `YouTube search failed: ${(err as Error).message}` };
    }

    const items = data.items ?? [];
    if (items.length === 0) {
      console.log(`[youtube_search] no results for: "${query}"`);
      return { content: `No YouTube videos found for "${query}".` };
    }

    let detailsById = new Map<string, YouTubeVideoItem>();
    try {
      detailsById = await fetchYoutubeVideoDetails(
        apiKey,
        items.map((item) => item.id?.videoId).filter(Boolean),
      );
    } catch (err) {
      console.warn(
        '[youtube_search] details fetch failed, falling back to search-only results:',
        (err as Error).message,
      );
    }

    const regionCode = DEFAULT_AVAILABILITY_REGION;
    const verifiedItems: YouTubeItem[] = [];
    for (const item of items) {
      const videoId = item.id?.videoId;
      if (!videoId) continue;

      const details = detailsById.get(videoId);
      if (detailsById.size > 0 && !isLikelyAvailableYoutubeVideo(details, regionCode)) {
        continue;
      }

      const oEmbedOk = await passesOEmbedAvailability(videoId);
      if (!oEmbedOk) continue;

      verifiedItems.push(item);
    }

    if (verifiedItems.length === 0) {
      console.log(`[youtube_search] no verified playable results for: "${query}"`);
      return {
        content:
          `No currently available YouTube videos found for "${query}". Try a more specific query.`,
      };
    }

    const lines: string[] = [`YouTube videos for: "${query}"\n`];
    for (const item of verifiedItems.slice(0, 3)) {
      const videoId = item.id?.videoId;
      if (!videoId) continue;
      const { title, channelTitle, description, publishedAt } = item.snippet;
      const url = `https://www.youtube.com/watch?v=${videoId}`;
      const date = formatDuration(publishedAt);
      const desc = description?.trim().replace(/\n+/g, ' ').substring(0, 120);
      lines.push(`Title: ${title}`);
      lines.push(`Channel: ${channelTitle}${date ? ` (${date})` : ''}`);
      if (desc) lines.push(`About: ${desc}...`);
      lines.push(`Link: ${url}`);
      lines.push('');
    }

    const result = lines.join('\n');
    console.log(
      `[youtube_search] found ${verifiedItems.length}/${items.length} verified results for: "${query}"`,
    );
    return { content: result };
  },
};
