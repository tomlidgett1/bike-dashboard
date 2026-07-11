import type { ToolContract } from './types.ts';
import { MODEL_MAP } from '../ai/models.ts';
import {
  buildSearchToolContent,
  buildWebSearchVariants,
  runSearchPipeline,
} from './search-pipeline.ts';

function buildDateTimeContext(timezone: string | null): string {
  const now = new Date();
  const tz = timezone ?? 'UTC';
  const formatted = now.toLocaleString('en-AU', {
    timeZone: tz,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
  const shortTz = now.toLocaleString('en-AU', { timeZone: tz, timeZoneName: 'short' }).split(' ').pop() ?? tz;
  return `${formatted} ${shortTz}`;
}

export const webSearchTool: ToolContract = {
  name: 'web_search',
  description:
    'Search the web for current, real-time information. Use this when the user asks about current events, recent news, live scores, live data, or anything that requires up-to-date information beyond your training data. You MUST provide a search query. Do NOT use this for questions you can already answer from context or general knowledge.',
  namespace: 'web.search',
  sideEffect: 'read',
  idempotent: true,
  timeoutMs: 25000,
  inputSchema: {
    type: 'object' as const,
    properties: {
      query: {
        type: 'string' as const,
        description: 'The search query to look up on the web.',
      },
    },
    required: ['query'],
  },
  handler: async (input, ctx) => {
    const query = (input.query as string) ?? '';
    const userTz = ctx?.timezone ?? null;
    if (!query) {
      return {
        content: 'No search query provided.',
        structuredData: {
          mode: 'web',
          originalQuery: query,
          bestAnswer: '',
          answerStyle: 'hedged',
          variants: [],
          sources: [],
          verification: {
            status: 'stale_or_unclear',
            confidence: 0,
            shouldHedge: true,
            notes: ['No search query was provided.'],
            independentSourceCount: 0,
            duplicateSourceCount: 0,
            corroboratedClaimCount: 0,
            conflictingClaimCount: 0,
            semanticAgreement: 0,
          },
        },
      };
    }

    try {
      const dateTimeContext = buildDateTimeContext(userTz);
      const timedQuery = `[Current date and time: ${dateTimeContext}] ${query}`;
      const bundle = await runSearchPipeline({
        mode: 'web',
        originalQuery: query,
        variants: buildWebSearchVariants({ originalQuery: query, timedQuery }),
        model: MODEL_MAP.fast,
      });
      const content = buildSearchToolContent(bundle);
      console.log(
        `[web_search] grounded pipeline: "${query}" -> ${bundle.sources.length} sources, ${bundle.verification.status}`,
      );
      return {
        content,
        structuredData: bundle,
      };
    } catch (err) {
      console.error(`[web_search] grounded pipeline failed:`, (err as Error).message);
      return {
        content: `Web search failed: ${(err as Error).message}`,
        structuredData: {
          mode: 'web',
          originalQuery: query,
          bestAnswer: '',
          answerStyle: 'hedged',
          variants: [],
          sources: [],
          verification: {
            status: 'stale_or_unclear',
            confidence: 0,
            shouldHedge: true,
            notes: [(err as Error).message],
            independentSourceCount: 0,
            duplicateSourceCount: 0,
            corroboratedClaimCount: 0,
            conflictingClaimCount: 0,
            semanticAgreement: 0,
          },
        },
      };
    }
  },
};
