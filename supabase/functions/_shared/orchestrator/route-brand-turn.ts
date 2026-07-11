import { resolveToolChoice, resolveTools } from './capability-tools.ts';
import { classifyBrandTurn } from './classify-brand-turn.ts';
import type { RouteDecision, TurnInput } from './types.ts';
import type { RouterContext } from './build-context.ts';

export async function routeBrandTurn(
  input: TurnInput,
  context: RouterContext,
): Promise<RouteDecision> {
  if (!input.brandContext) {
    throw new Error('routeBrandTurn called without brandContext');
  }

  const start = Date.now();
  const classification = await classifyBrandTurn(input, context);
  const latency = Date.now() - start;

  const requiredCapabilities = [...classification.requiredCapabilities];
  if (input.brandContext.bookingState && !requiredCapabilities.includes('brand.booking.read')) {
    requiredCapabilities.push('brand.booking.read');
  }

  const effectiveClassifier = {
    ...classification,
    requiredCapabilities,
  };

  const allowedNamespaces = resolveTools(effectiveClassifier);
  const forcedToolChoice = resolveToolChoice(effectiveClassifier);
  const useAgentModel = input.brandContext.isInternal || effectiveClassifier.requiresToolUse;

  return {
    mode: 'single_agent',
    agent: 'smart',
    allowedNamespaces,
    needsMemoryRead: true,
    needsMemoryWriteCandidate: false,
    needsWebFreshness: false,
    userStyle: effectiveClassifier.style,
    confidence: effectiveClassifier.confidence,
    fastPathUsed: false,
    routerLatencyMs: latency,
    primaryDomain: 'brand',
    secondaryDomains: [],
    classifierResult: effectiveClassifier,
    memoryDepth: effectiveClassifier.memoryDepth,
    forcedToolChoice,
    routeLayer: 'brand',
    routeReason: classification.reason ?? 'brand_reasoning_router',
    reasoningEffortOverride: useAgentModel ? 'medium' : 'low',
    modelTierOverride: useAgentModel ? 'agent' : 'brand_chat',
  };
}
