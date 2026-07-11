export type ConversationEngagementScope = 'nest' | 'brand';

export interface ConversationEngagement {
  scope: ConversationEngagementScope;
  brandKey?: string | null;
}

export interface ConversationScopeFilter {
  scope?: 'all' | ConversationEngagementScope;
  brandKey?: string | null;
}

export const NEST_CONVERSATION_ENGAGEMENT: ConversationEngagement = {
  scope: 'nest',
};

export const NEST_CONVERSATION_FILTER: ConversationScopeFilter = {
  scope: 'nest',
};

export function normaliseConversationEngagement(
  engagement?: ConversationEngagement | null,
): { scope: ConversationEngagementScope; brandKey: string | null } {
  if (!engagement || engagement.scope === 'nest') {
    return { scope: 'nest', brandKey: null };
  }

  const brandKey = engagement.brandKey?.trim().toLowerCase() ?? '';
  if (!brandKey) {
    throw new Error('brand engagement requires a brandKey');
  }

  return {
    scope: 'brand',
    brandKey,
  };
}

export function normaliseConversationScopeFilter(
  filter?: ConversationScopeFilter | null,
): { scope: 'all' | ConversationEngagementScope; brandKey: string | null } {
  if (!filter || !filter.scope || filter.scope === 'all') {
    return { scope: 'all', brandKey: null };
  }

  if (filter.scope === 'nest') {
    return { scope: 'nest', brandKey: null };
  }

  const brandKey = filter.brandKey?.trim().toLowerCase() ?? '';
  if (!brandKey) {
    throw new Error('brand conversation filter requires a brandKey');
  }

  return {
    scope: 'brand',
    brandKey,
  };
}

export function getTurnConversationEngagement(
  input: { brandContext?: { brandKey?: string | null } | null },
): ConversationEngagement {
  const brandKey = input.brandContext?.brandKey?.trim().toLowerCase();
  if (!brandKey) return NEST_CONVERSATION_ENGAGEMENT;
  return { scope: 'brand', brandKey };
}
