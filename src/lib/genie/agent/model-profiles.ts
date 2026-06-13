import type { GenieOrchestrationDecision } from '@/lib/genie/orchestration'

export type GenieModelProfile = 'default' | 'nano'

export type GenieModelConfig = {
  orchestrator: string
  planner: string
  fastExecutor: string
  strategicExecutor: string
  executor: string
}

export type GenieRuntimePolicy = {
  /** Skip the planning agent — go straight to tools + answer. */
  skipPlanner: boolean
  /** Cap verify_question_answered loops (0 = tool excluded entirely). */
  maxVerifyCalls: number
  useVerifyJudge: boolean
  includeSpecialists: boolean
  includeRecheckTools: boolean
  /** Allow the executor to fire independent tools concurrently. */
  parallelToolCalls: boolean
  maxToolConcurrency: number
  maxTurnsForRoute: (
    route: GenieOrchestrationDecision['route'],
    planned: boolean,
  ) => number
  executorReasoningEffort: (
    route: GenieOrchestrationDecision['route'],
    planned: boolean,
  ) => 'none' | 'low' | 'medium'
  /** Replace the heavy verification contract in the system prompt. */
  fastAnswerPrompt: boolean
}

export const DEFAULT_GENIE_MODELS: GenieModelConfig = {
  orchestrator: 'gpt-5.4-nano',
  planner: 'gpt-5.5',
  fastExecutor: 'gpt-5.4-mini',
  strategicExecutor: 'gpt-5.5',
  executor: 'gpt-5.4-mini',
}

export const NANO_GENIE_MODELS: GenieModelConfig = {
  orchestrator: 'gpt-5.4-nano',
  planner: 'gpt-5.4-nano',
  fastExecutor: 'gpt-5.4-nano',
  strategicExecutor: 'gpt-5.4-nano',
  executor: 'gpt-5.4-nano',
}

const NANO_EXCLUDED_TOOLS = new Set([
  'verify_question_answered',
  'record_answer_recheck',
  'record_lightspeed_recheck',
  'consult_bike_store_analyst',
  'consult_cycling_compatibility_specialist',
])

export const DEFAULT_RUNTIME_POLICY: GenieRuntimePolicy = {
  skipPlanner: false,
  maxVerifyCalls: 1,
  useVerifyJudge: false,
  includeSpecialists: true,
  includeRecheckTools: true,
  parallelToolCalls: false,
  maxToolConcurrency: 1,
  maxTurnsForRoute: (route, planned) => {
    if (route === 'business_analysis') return 40
    if (planned) return 40
    if (route === 'web_research') return 8
    if (route === 'lightspeed_sql' || route === 'storefront_action') return 16
    if (route === 'mixed') return 24
    return 8
  },
  executorReasoningEffort: (route, planned) => {
    if (planned || route === 'business_analysis') return 'medium'
    return 'low'
  },
  fastAnswerPrompt: false,
}

export const NANO_RUNTIME_POLICY: GenieRuntimePolicy = {
  skipPlanner: false,
  maxVerifyCalls: 0,
  useVerifyJudge: false,
  includeSpecialists: false,
  includeRecheckTools: false,
  parallelToolCalls: true,
  maxToolConcurrency: 6,
  maxTurnsForRoute: (route, planned) => {
    if (route === 'business_analysis') return 8
    if (planned) return 8
    if (route === 'mixed') return 8
    if (route === 'lightspeed_sql' || route === 'storefront_action') return 6
    if (route === 'web_research') return 4
    return 4
  },
  executorReasoningEffort: () => 'low',
  fastAnswerPrompt: true,
}

export function getGenieModelConfig(profile: GenieModelProfile = 'default'): GenieModelConfig {
  return profile === 'nano' ? NANO_GENIE_MODELS : DEFAULT_GENIE_MODELS
}

export function getGenieRuntimePolicy(profile: GenieModelProfile = 'default'): GenieRuntimePolicy {
  return profile === 'nano' ? NANO_RUNTIME_POLICY : DEFAULT_RUNTIME_POLICY
}

export function normalizeGenieModelProfile(value: unknown): GenieModelProfile {
  return value === 'nano' ? 'nano' : 'default'
}

export function isToolExcludedForProfile(toolName: string, profile: GenieModelProfile): boolean {
  if (profile !== 'nano') return false
  return NANO_EXCLUDED_TOOLS.has(toolName)
}

export function canRunParallelToolsForProfile(
  route: GenieOrchestrationDecision['route'],
  profile: GenieModelProfile,
): boolean {
  const runtime = getGenieRuntimePolicy(profile)
  if (runtime.parallelToolCalls) return true
  return route === 'lightspeed_sql' || route === 'business_analysis' || route === 'web_research'
}

export function maxToolConcurrencyForProfile(
  route: GenieOrchestrationDecision['route'],
  profile: GenieModelProfile,
): number {
  const runtime = getGenieRuntimePolicy(profile)
  if (runtime.parallelToolCalls) return runtime.maxToolConcurrency
  if (route === 'business_analysis') return 6
  if (route === 'lightspeed_sql' || route === 'web_research') return 4
  return 1
}
