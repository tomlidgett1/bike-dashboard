// Genie agent runtime: model constants, tracing, store-time helpers.
// Extracted from src/app/api/genie/agent/route.ts

import fs from 'fs'
import path from 'path'

import { Runner } from '@openai/agents'

import {
  type GenieOrchestrationDecision,
} from '@/lib/genie/orchestration'

const PLANNER_MODEL = 'gpt-5.5'
const FAST_EXECUTOR_MODEL = 'gpt-5.4-mini'
const STRATEGIC_EXECUTOR_MODEL = 'gpt-5.5'
const EXECUTOR_MODEL = FAST_EXECUTOR_MODEL
const ORCHESTRATOR_MODEL = 'gpt-5.4-nano'
const SMART_AGENT_MAX_TURNS = 40
// Trimmed from 60: runs that reach for 60 turns balloon to 8+ minutes and tend
// to overflow context and fail without ever answering. 40 still covers a deep
// multi-query analysis while bounding the worst case.
const STRATEGIC_AGENT_MAX_TURNS = 40
const STREAM_HEARTBEAT_MS = 15_000
const STORE_TIME_ZONE = 'Australia/Brisbane'
const STORE_UTC_OFFSET = '+10:00'
function createGenieRunner(args: {
  requestId: string
  userId: string
  storeName: string
  route?: GenieOrchestrationDecision['route'] | null
  stage: string
  workflowName: string
}) {
  return new Runner({
    tracingDisabled: !isGenieTracingEnabled(),
    traceIncludeSensitiveData: false,
    workflowName: args.workflowName,
    traceId: genieTraceId(args.requestId, args.stage),
    groupId: args.userId,
    traceMetadata: genieTraceMetadata({
      requestId: args.requestId,
      userId: args.userId,
      storeName: args.storeName,
      route: args.route,
      stage: args.stage,
    }),
  })
}

function isGenieTracingEnabled(): boolean {
  return process.env.GENIE_AGENT_TRACING?.toLowerCase() !== 'off'
}

function genieTraceMetadata(args: {
  requestId: string
  userId: string
  storeName: string
  route?: GenieOrchestrationDecision['route'] | null
  stage?: string
}) {
  return {
    request_id: args.requestId,
    user_id: args.userId,
    store_name: args.storeName,
    route: args.route ?? 'unknown',
    stage: args.stage ?? 'agent',
    surface: 'home_genie',
  }
}

function genieTraceId(requestId: string, stage: string): string {
  return `trace_${requestId.replace(/-/g, '')}_${stage}`
}
let cachedLightspeedInstructions: string | null = null

function getLightspeedInstructions(): string {
  if (cachedLightspeedInstructions != null) return cachedLightspeedInstructions
  cachedLightspeedInstructions = fs.readFileSync(path.join(process.cwd(), 'lightspeed.md'), 'utf8')
  return cachedLightspeedInstructions
}

function getStoreToday(): string {
  return storeDateFromDate(new Date())
}

function storeDateFromDate(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: STORE_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

export {
  PLANNER_MODEL,
  FAST_EXECUTOR_MODEL,
  STRATEGIC_EXECUTOR_MODEL,
  EXECUTOR_MODEL,
  ORCHESTRATOR_MODEL,
  SMART_AGENT_MAX_TURNS,
  STRATEGIC_AGENT_MAX_TURNS,
  STREAM_HEARTBEAT_MS,
  STORE_TIME_ZONE,
  STORE_UTC_OFFSET,
  createGenieRunner,
  isGenieTracingEnabled,
  genieTraceMetadata,
  genieTraceId,
  getLightspeedInstructions,
  getStoreToday,
  storeDateFromDate,
}
