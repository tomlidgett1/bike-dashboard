// Genie agent Deputy tools: read-only staff scheduling access — the team
// (employees), timesheets (hours actually worked), and rosters (scheduled
// shifts). Answers "who worked this week", "who is on tomorrow", and "how many
// hours did X work this week".

import { tool } from '@openai/agents'
import { z } from 'zod'

import { compactGenieProgressText } from '@/lib/genie/progress-text'
import {
  DeputyNotConnectedError,
  getDeputyConnection,
  getDeputyRosters,
  getDeputyTimesheets,
  isDeputyConfigured,
  listDeputyEmployees,
} from '@/lib/services/deputy'

type Emit = (data: object) => void

function emitDeputyStatus(emit: Emit, phase: string, text: string) {
  emit({ event: 'status', phase, text: compactGenieProgressText(text, phase) })
}

const DEPUTY_NOT_CONNECTED_OUTPUT = {
  connected: false,
  message:
    'Deputy is not connected for this store. Ask the user to connect Deputy using the "Connect Deputy" pill on the Home page (it links to /api/deputy/auth/initiate). Do not invent staff, shifts, or hours.',
}

async function withDeputy<T extends object>(run: () => Promise<T>): Promise<T | typeof DEPUTY_NOT_CONNECTED_OUTPUT | { error: string }> {
  try {
    return await run()
  } catch (error) {
    if (error instanceof DeputyNotConnectedError) {
      return { ...DEPUTY_NOT_CONNECTED_OUTPUT, message: `${error.message} ${DEPUTY_NOT_CONNECTED_OUTPUT.message}` }
    }
    console.error('[Deputy tool] error:', error)
    return { error: error instanceof Error ? error.message : 'Deputy request failed' }
  }
}

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')

export function buildDeputyTools(userId: string, emit: Emit) {
  return [
    tool({
      name: 'get_deputy_connection_status',
      description: 'Check whether the store has connected Deputy (staff scheduling / time & attendance). Use when the user asks to connect/check Deputy, or before answering staffing questions if a Deputy tool just reported not-connected. Returns the account/company name when connected.',
      parameters: z.object({}),
      async execute() {
        emitDeputyStatus(emit, 'deputy', 'Checking Deputy connection...')
        if (!isDeputyConfigured()) {
          return { configured: false, connected: false, message: 'Deputy integration is not configured on this environment.' }
        }
        const connection = await getDeputyConnection(userId)
        if (connection?.status !== 'connected') {
          return {
            configured: true,
            connected: false,
            status: connection?.status ?? 'disconnected',
            message: 'Deputy is not connected. The user can connect with the "Connect Deputy" pill on the Home page, which starts the secure Deputy sign-in at /api/deputy/auth/initiate.',
          }
        }
        return {
          configured: true,
          connected: true,
          account_name: connection.company_name ?? connection.account_name ?? connection.install_name ?? null,
          connected_at: connection.connected_at,
        }
      },
    }),
    tool({
      name: 'list_deputy_employees',
      description: 'List the store\'s Deputy staff (team members). Returns each person\'s name and active status. Use to see who is on the team, to confirm spelling of a staff member\'s name before a timesheet/roster lookup, or when asked "who works here / who is on staff".',
      parameters: z.object({
        include_inactive: z.boolean().optional().describe('Include archived/inactive staff. Defaults to active only.'),
      }),
      async execute(args) {
        emitDeputyStatus(emit, 'deputy', 'Deputy: loading staff list...')
        return withDeputy(() => listDeputyEmployees(userId, { activeOnly: !args.include_inactive }))
      },
    }),
    tool({
      name: 'get_deputy_timesheets',
      description: 'Get Deputy TIMESHEETS — hours ACTUALLY WORKED (clock-in/clock-out records) over a date range. Use for "who worked this week", "how many hours did X work", "who is working right now" (set only_in_progress), and total/who-worked-when questions. Returns per-shift rows (employee, date, start, end, hours, area, in-progress) plus per-employee hour totals and the overall total. Compute from_date/to_date from STORE CONTEXT today (e.g. this week = Monday..Sunday). For one person, pass employee_name.',
      parameters: z.object({
        from_date: isoDate.describe('Start of the range (YYYY-MM-DD), inclusive.'),
        to_date: isoDate.optional().describe('End of the range (YYYY-MM-DD), inclusive. Omit for a single day.'),
        employee_name: z.string().optional().describe('Filter to one staff member by name (full or partial, case-insensitive).'),
        only_in_progress: z.boolean().optional().describe('Only shifts currently clocked on (use for "who is working now").'),
      }),
      async execute(args) {
        emitDeputyStatus(emit, 'deputy', args.employee_name ? `Deputy: hours for ${args.employee_name.trim()}` : 'Deputy: reading timesheets')
        return withDeputy(() => getDeputyTimesheets(userId, {
          fromDate: args.from_date,
          toDate: args.to_date,
          employeeName: args.employee_name,
          onlyInProgress: args.only_in_progress,
        }))
      },
    }),
    tool({
      name: 'get_deputy_rosters',
      description: 'Get Deputy ROSTERS — SCHEDULED (planned) shifts over a date range, including who is rostered and any open/unassigned shifts. Use for "who is working tomorrow", "who is on this weekend", "what is the roster for next week", and upcoming-shift questions. Returns per-shift rows (employee, date, start, end, hours, area, open, published) plus per-employee scheduled-hour totals. Compute from_date/to_date from STORE CONTEXT today. For one person, pass employee_name.',
      parameters: z.object({
        from_date: isoDate.describe('Start of the range (YYYY-MM-DD), inclusive.'),
        to_date: isoDate.optional().describe('End of the range (YYYY-MM-DD), inclusive. Omit for a single day.'),
        employee_name: z.string().optional().describe('Filter to one staff member by name (full or partial, case-insensitive).'),
        open_only: z.boolean().optional().describe('Only open/unassigned shifts that still need someone.'),
      }),
      async execute(args) {
        emitDeputyStatus(emit, 'deputy', args.employee_name ? `Deputy: roster for ${args.employee_name.trim()}` : 'Deputy: reading roster')
        return withDeputy(() => getDeputyRosters(userId, {
          fromDate: args.from_date,
          toDate: args.to_date,
          employeeName: args.employee_name,
          openOnly: args.open_only,
        }))
      },
    }),
  ]
}
