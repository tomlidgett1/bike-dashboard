// Genie agent orchestrator: LLM router decision + execution planner calls.

import fs from 'fs'
import path from 'path'

import { Agent, type AgentInputItem } from '@openai/agents'

import {
  GenieOrchestrationDecisionSchema,
  type GenieOrchestrationDecision,
} from '@/lib/genie/orchestration'

import { ORCHESTRATOR_MODEL, PLANNER_MODEL, createGenieRunner } from './runtime'
import { GenieExecutionPlanSchema, buildOrchestratorInstructions, buildPlannerInstructions, type GenieExecutionPlan } from './prompts'
import { toRouterInputMessages, type Message } from './context'

async function createGenieOrchestrationDecision(args: {
  storeName: string
  userId: string
  requestId: string
  messages: Message[]
  signal: AbortSignal
}): Promise<GenieOrchestrationDecision> {
  const orchestratorAgent = new Agent({
    name: 'Yellow Jersey Orchestrator',
    model: ORCHESTRATOR_MODEL,
    instructions: buildOrchestratorInstructions(args.storeName),
    outputType: GenieOrchestrationDecisionSchema,
    modelSettings: {
      parallelToolCalls: false,
      store: false,
      reasoning: { effort: 'none', summary: 'auto' },
      text: { verbosity: 'low' },
    },
  })

  try {
    const runner = createGenieRunner({
      requestId: args.requestId,
      userId: args.userId,
      storeName: args.storeName,
      stage: 'router',
      workflowName: 'Yellow Jersey Genie Router',
    })
    const result = await runner.run(orchestratorAgent, toRouterInputMessages(args.messages), {
      maxTurns: 1,
      signal: args.signal,
    })

    const parsed = GenieOrchestrationDecisionSchema.safeParse(result.finalOutput)
    if (!parsed.success) {
      console.error('[Genie Agent] LLM router returned invalid output', {
        issues: parsed.error.issues,
        output: result.finalOutput,
      })
      throw new Error('LLM router returned an invalid orchestration decision.')
    }

    return parsed.data
  } catch (error) {
    console.error('[Genie Agent] LLM orchestration failed:', error)
    throw error instanceof Error
      ? error
      : new Error('LLM router failed to classify the request.')
  }
}

async function createGenieExecutionPlan(args: {
  storeName: string
  userId: string
  requestId: string
  inputMessages: AgentInputItem[]
  route: GenieOrchestrationDecision['route']
  signal: AbortSignal
  /** Receives reasoning summary deltas so planning is no longer dead air in the UI. */
  emit?: (data: object) => void
}): Promise<GenieExecutionPlan | null> {
  const plannerAgent = new Agent({
    name: 'Yellow Jersey Planning Agent',
    model: PLANNER_MODEL,
    instructions: buildPlannerInstructions(args.storeName),
    outputType: GenieExecutionPlanSchema,
    modelSettings: {
      parallelToolCalls: false,
      store: false,
      reasoning: {
        effort: args.route === 'business_analysis' ? 'medium' : 'low',
        summary: 'concise',
      },
      text: { verbosity: 'low' },
    },
  })

  try {
    const runner = createGenieRunner({
      requestId: args.requestId,
      userId: args.userId,
      storeName: args.storeName,
      route: args.route,
      stage: 'planner',
      workflowName: 'Yellow Jersey Genie Planner',
    })
    const stream = await runner.run(plannerAgent, args.inputMessages, {
      stream: true,
      maxTurns: 1,
      signal: args.signal,
      reasoningItemIdPolicy: 'omit',
    })

    for await (const event of stream) {
      if (event.type !== 'raw_model_stream_event' || !args.emit) continue
      const raw = event.data as {
        type?: string
        delta?: unknown
        text?: unknown
        event?: { type?: string; delta?: unknown; text?: unknown }
      }
      const rawType = raw.type ?? raw.event?.type
      const delta =
        typeof raw.delta === 'string'
          ? raw.delta
          : typeof raw.event?.delta === 'string'
            ? raw.event.delta
            : ''
      const reasoningText =
        typeof raw.text === 'string'
          ? raw.text
          : typeof raw.event?.text === 'string'
            ? raw.event.text
            : ''

      if (rawType === 'response.reasoning_summary_text.delta' && delta) {
        args.emit({ event: 'reasoning_delta', text: delta })
      }
      if (
        (rawType === 'response.reasoning_summary_text.done' ||
          rawType === 'response.reasoning_summary_part.done') &&
        reasoningText
      ) {
        args.emit({ event: 'reasoning_done', text: reasoningText })
      }
    }

    await stream.completed
    return stream.finalOutput ?? null
  } catch (error) {
    console.warn('[Genie Agent] Planning failed; falling back to executor-only run:', error)
    return null
  }
}

export { createGenieOrchestrationDecision, createGenieExecutionPlan }
