import { MEMORY_V2_ENABLED } from '../env.ts';
import { formatHistory, buildMessageContent, timed, type RouterContext, type ContextBuildResult } from './build-context.ts';
import type { TurnInput } from './types.ts';
import { emptyWorkingMemory } from './types.ts';
import { getTurnConversationEngagement } from '../conversation-engagement.ts';
import {
  historyContentForInbound,
  mediaMetadataFromParts,
} from '../inbound-media-metadata.ts';

export async function buildBrandRouterContext(
  input: TurnInput,
): Promise<RouterContext> {
  const { getConversation } = await import('../state.ts');
  const engagement = getTurnConversationEngagement(input);
  const brandFilter = { scope: 'brand' as const, brandKey: engagement.brandKey };

  const [history, workingMemory] = await Promise.all([
    getConversation(input.chatId, 20, brandFilter),
    Promise.resolve(emptyWorkingMemory()),
  ]);

  const recentTurns = history.slice(-6).map((message) => {
    let content = message.content;
    if (message.role === 'assistant' && message.metadata) {
      const tools = message.metadata.tools_used as
        | Array<{ tool: string; detail?: string }>
        | undefined;
      if (tools && tools.length > 0) {
        content += ' ' + tools.map((tool) => `[${tool.tool}]`).join(' ');
      }
    }
    return { role: message.role, content };
  });

  return {
    recentTurns,
    workingMemory,
    pendingEmailSend: null,
    pendingEmailSends: [],
    preloadedHistory: history,
    preloadedProfile: null,
    preloadedAccounts: [],
  };
}

export async function buildBrandContext(
  input: TurnInput,
  routerCtx?: RouterContext,
): Promise<ContextBuildResult> {
  const hasPreloadedHistory = routerCtx?.preloadedHistory !== undefined;
  const engagement = getTurnConversationEngagement(input);
  const brandFilter = { scope: 'brand' as const, brandKey: engagement.brandKey };
  const { getConversation, getConversationSummaries, getRecentToolTraces, addMessage } =
    await import('../state.ts');

  const historyP = hasPreloadedHistory
    ? Promise.resolve({ result: routerCtx!.preloadedHistory!, ms: 0 })
    : timed(() => getConversation(input.chatId, 20, brandFilter));
  const summariesP = MEMORY_V2_ENABLED
    ? timed(() => getConversationSummaries(input.chatId, 6, brandFilter))
    : Promise.resolve({ result: [], ms: 0 });
  const tracesP = MEMORY_V2_ENABLED
    ? timed(() => getRecentToolTraces(input.chatId, 8, brandFilter))
    : Promise.resolve({ result: [], ms: 0 });
  const messageContentP = timed(() => buildMessageContent(input));

  const [historyT, summariesT, tracesT, messageContentT] = await Promise.all([
    historyP,
    summariesP,
    tracesP,
    messageContentP,
  ]);

  const history = historyT.result;
  const summaries = summariesT.result;
  const toolTraces = tracesT.result;
  const { messageContent, transcriptions, transcriptionFailed, textToSend } =
    messageContentT.result;

  const historyContent = historyContentForInbound(input.userMessage, input.images);
  const mediaMetadata = mediaMetadataFromParts({
    images: input.images,
    audio: input.audio,
  });
  const hasInboundMedia = input.images.length > 0 || input.audio.length > 0;

  // Persist only real customer text and/or media — never AI placeholder strings like
  // "What's in this image?" which are for the model only.
  if (historyContent || hasInboundMedia) {
    addMessage(input.chatId, 'user', historyContent, input.senderHandle, {
      isGroupChat: input.isGroupChat,
      chatName: input.chatName,
      participantNames: input.participantNames,
      service: input.service,
      engagement,
      metadata: mediaMetadata,
      providerMessageId: input.providerMessageId,
    }).catch((err) =>
      console.warn('[build-brand-context] addMessage failed:', (err as Error).message)
    );
  }

  const recentTurns = routerCtx?.recentTurns ?? history.slice(-6).map((message) => ({
    role: message.role,
    content: message.content,
  }));

  const formatHistoryStart = Date.now();
  const formattedHistory = formatHistory(history, input.isGroupChat);
  const formatHistoryMs = Date.now() - formatHistoryStart;

  const workingMemoryStart = Date.now();
  const workingMemory = routerCtx?.workingMemory ?? emptyWorkingMemory();
  const workingMemoryMs = Date.now() - workingMemoryStart;

  return {
    history,
    formattedHistory,
    messageContent,
    recentTurns,
    memoryItems: [],
    entities: [],
    summaries,
    toolTraces,
    ragEvidence: '',
    ragEvidenceBlockCount: 0,
    senderProfile: null,
    connectedAccounts: [],
    transcriptions,
    transcriptionFailed,
    workingMemory,
    pendingEmailSend: null,
    pendingEmailSends: [],
    resolvedUserContext: null,
    subTimings: {
      historyMs: historyT.ms,
      memoryMs: 0,
      summariesMs: summariesT.ms,
      toolTracesMs: tracesT.ms,
      profileMs: 0,
      accountsMs: 0,
      messageContentMs: messageContentT.ms,
      ragMs: 0,
      workingMemoryMs,
      formatHistoryMs,
    },
  };
}
