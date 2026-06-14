/**
 * Deputy API client
 *
 * Thin authenticated wrapper over the Deputy Resource API plus typed helpers
 * for the data the Genie needs: employees (the team), timesheets (hours
 * actually worked), and rosters (scheduled shifts). Read-only.
 *
 * Every call goes to the store-specific host stored on the connection
 * ({install}.{geo}.deputy.com) with a Bearer token. The Resource API returns at
 * most 500 records per call; for a single bike store that is ample.
 */

import {
  DEPUTY_CONFIG,
  DEPUTY_TIME_ZONE,
  deputyApiBaseUrl,
} from './config'
import {
  getDeputyConnection,
  getValidDeputyAccessToken,
  updateDeputyConnectionStatus,
} from './token-manager'
import type {
  DeputyEmployee,
  DeputyEmployeeHours,
  DeputyEmployeeSummary,
  DeputyOperationalUnit,
  DeputyRoster,
  DeputyRosterRow,
  DeputyTimesheet,
  DeputyTimesheetRow,
} from './types'

export class DeputyNotConnectedError extends Error {
  constructor(message = 'Deputy is not connected for this store.') {
    super(message)
    this.name = 'DeputyNotConnectedError'
  }
}

async function deputyAuthContext(userId: string): Promise<{ accessToken: string; endpoint: string }> {
  const connection = await getDeputyConnection(userId)
  if (!connection || connection.status !== 'connected' || !connection.endpoint) {
    throw new DeputyNotConnectedError()
  }

  const accessToken = await getValidDeputyAccessToken(userId)
  if (!accessToken) {
    throw new DeputyNotConnectedError('Deputy token is expired or revoked. Please reconnect Deputy.')
  }

  return { accessToken, endpoint: connection.endpoint }
}

async function deputyFetch(
  userId: string,
  path: string,
  init: { method: 'GET' | 'POST'; body?: unknown },
): Promise<unknown> {
  const { accessToken, endpoint } = await deputyAuthContext(userId)
  const url = `${deputyApiBaseUrl(endpoint)}${path}`

  const doFetch = () => fetch(url, {
    method: init.method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
      ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  })

  let response = await doFetch()

  if (response.status === 429) {
    const retryAfter = Math.min(Number(response.headers.get('Retry-After') || '2'), 15)
    await new Promise(resolve => setTimeout(resolve, retryAfter * 1000))
    response = await doFetch()
  }

  if (response.status === 401 || response.status === 403) {
    await updateDeputyConnectionStatus(userId, 'error', `Deputy API auth error (${response.status})`)
    throw new DeputyNotConnectedError('Deputy authorisation failed. Please reconnect Deputy.')
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`Deputy API error ${response.status} on ${path}: ${body.slice(0, 500)}`)
  }

  return response.json()
}

/** Authenticated GET against the Deputy Resource API. */
export async function deputyGet<T = unknown>(userId: string, path: string): Promise<T> {
  return deputyFetch(userId, path, { method: 'GET' }) as Promise<T>
}

interface DeputyQuerySearchCondition {
  field: string
  // Resource API comparison types: eq, ne, gt, ge, lt, le, like, in, is
  type: 'eq' | 'ne' | 'gt' | 'ge' | 'lt' | 'le' | 'like' | 'in' | 'is'
  data: string | number | boolean | Array<string | number>
}

interface DeputyQueryBody {
  search?: Record<string, DeputyQuerySearchCondition>
  max?: number
  start?: number
  join?: string[]
}

/** POST a QUERY against a Deputy resource object, e.g. Timesheet / Roster. */
export async function deputyQuery<T = unknown>(
  userId: string,
  object: string,
  body: DeputyQueryBody,
): Promise<T[]> {
  const result = await deputyFetch(userId, `/resource/${object}/QUERY`, {
    method: 'POST',
    body: { max: DEPUTY_CONFIG.MAX_RECORDS, ...body },
  })
  return Array.isArray(result) ? (result as T[]) : []
}

// ============================================================
// Date / time helpers
// ============================================================

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

/** YYYY-MM-DD in the store timezone. */
function storeDateFromInstant(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: DEPUTY_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

/** Unix seconds at start of a store calendar day (Brisbane, UTC+10). */
function storeDayStartUnix(isoDate: string): number {
  return Math.floor(new Date(`${isoDate}T00:00:00+10:00`).getTime() / 1000)
}

/** Unix seconds at end of a store calendar day (Brisbane, UTC+10). */
function storeDayEndUnix(isoDate: string): number {
  return Math.floor(new Date(`${isoDate}T23:59:59+10:00`).getTime() / 1000)
}

/**
 * Deputy returns Date as date-time (e.g. 2024-06-14T00:00:00+10:00) and it is
 * optional — normalise to YYYY-MM-DD for grouping, falling back to StartTime.
 */
function normalizeStoreDate(
  dateValue: string | null | undefined,
  startTimeSeconds?: number | null,
): string | null {
  if (typeof dateValue === 'string' && dateValue.trim()) {
    const trimmed = dateValue.trim()
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed
    const parsed = new Date(trimmed)
    if (!Number.isNaN(parsed.getTime())) return storeDateFromInstant(parsed)
    const prefix = trimmed.slice(0, 10)
    if (/^\d{4}-\d{2}-\d{2}$/.test(prefix)) return prefix
  }
  if (typeof startTimeSeconds === 'number' && startTimeSeconds > 0) {
    return storeDateFromInstant(new Date(startTimeSeconds * 1000))
  }
  return null
}

/** "HH:MM" for a unix-seconds timestamp in the store timezone. */
function hhmmFromUnix(seconds: number): string | null {
  if (!Number.isFinite(seconds) || seconds <= 0) return null
  try {
    return new Intl.DateTimeFormat('en-AU', {
      timeZone: DEPUTY_TIME_ZONE,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(new Date(seconds * 1000))
  } catch {
    return null
  }
}

/** "HH:MM" from a Deputy *Localized ISO string (already store-local). */
function hhmmFromLocalized(iso: string | null | undefined): string | null {
  if (!iso) return null
  const match = iso.match(/T(\d{2}:\d{2})/)
  return match ? match[1] : null
}

/** Prefer the localized field; fall back to converting the unix timestamp. */
function shiftTimes(record: { StartTime?: number | null; EndTime?: number | null; StartTimeLocalized?: string | null; EndTimeLocalized?: string | null }): { start: string | null; end: string | null } {
  return {
    start: hhmmFromLocalized(record.StartTimeLocalized) ?? (record.StartTime ? hhmmFromUnix(record.StartTime) : null),
    end: hhmmFromLocalized(record.EndTimeLocalized) ?? (record.EndTime ? hhmmFromUnix(record.EndTime) : null),
  }
}

/** Hours for a shift: use TotalTime when present, else derive from start/end. */
function shiftHours(record: { TotalTime?: number | null; StartTime?: number | null; EndTime?: number | null; Mealbreak?: number | null }): number | null {
  if (typeof record.TotalTime === 'number' && record.TotalTime > 0) return round2(record.TotalTime)
  if (typeof record.StartTime === 'number' && typeof record.EndTime === 'number' && record.EndTime > record.StartTime) {
    const grossHours = (record.EndTime - record.StartTime) / 3600
    const mealHours = typeof record.Mealbreak === 'number' ? record.Mealbreak / 60 : 0
    return round2(Math.max(0, grossHours - mealHours))
  }
  return null
}

// ============================================================
// Reference data (employees + locations) for name resolution
// ============================================================

function employeeName(employee: DeputyEmployee): string {
  const display = typeof employee.DisplayName === 'string' ? employee.DisplayName.trim() : ''
  if (display) return display
  const full = [employee.FirstName, employee.LastName].filter(Boolean).join(' ').trim()
  return full || `Employee ${employee.Id}`
}

/** Map of employeeId → summary, used to resolve names on timesheets/rosters. */
export async function fetchDeputyEmployeeMap(userId: string): Promise<Map<number, DeputyEmployeeSummary>> {
  const employees = await deputyGet<DeputyEmployee[]>(userId, '/resource/Employee')
  const map = new Map<number, DeputyEmployeeSummary>()
  for (const employee of Array.isArray(employees) ? employees : []) {
    map.set(employee.Id, {
      id: employee.Id,
      name: employeeName(employee),
      active: employee.Active !== false,
    })
  }
  return map
}

/** Best-effort map of operationalUnitId → area name (never throws). */
async function fetchDeputyOperationalUnitMap(userId: string): Promise<Map<number, string>> {
  const map = new Map<number, string>()
  try {
    const units = await deputyGet<DeputyOperationalUnit[]>(userId, '/resource/OperationalUnit')
    for (const unit of Array.isArray(units) ? units : []) {
      if (unit.OperationalUnitName) map.set(unit.Id, unit.OperationalUnitName)
    }
  } catch (error) {
    console.warn('[Deputy] Could not load operational units:', error)
  }
  return map
}

function resolveEmployeeIds(map: Map<number, DeputyEmployeeSummary>, name: string): number[] {
  const needle = name.trim().toLowerCase()
  if (!needle) return []
  const matches: number[] = []
  for (const summary of map.values()) {
    if (summary.name.toLowerCase().includes(needle)) matches.push(summary.id)
  }
  return matches
}

// ============================================================
// Public helpers
// ============================================================

export async function listDeputyEmployees(userId: string, args: { activeOnly?: boolean } = {}): Promise<{
  employees: DeputyEmployeeSummary[]
}> {
  const map = await fetchDeputyEmployeeMap(userId)
  let employees = Array.from(map.values())
  if (args.activeOnly !== false) employees = employees.filter(employee => employee.active)
  employees.sort((a, b) => a.name.localeCompare(b.name))
  return { employees }
}

interface TimesheetArgs {
  fromDate: string
  toDate?: string
  employeeName?: string
  onlyInProgress?: boolean
}

/**
 * Timesheets = hours actually worked. Answers "who worked this week" and
 * "how many hours did X work". Returns per-shift rows plus per-employee totals.
 */
export async function getDeputyTimesheets(userId: string, args: TimesheetArgs): Promise<{
  range: { from: string; to: string }
  employee_filter: string | null
  unresolved_employee: boolean
  total_hours: number
  by_employee: DeputyEmployeeHours[]
  timesheets: DeputyTimesheetRow[]
}> {
  const [employeeMap, unitMap] = await Promise.all([
    fetchDeputyEmployeeMap(userId),
    fetchDeputyOperationalUnitMap(userId),
  ])

  const toDate = args.toDate ?? args.fromDate
  const search: Record<string, DeputyQuerySearchCondition> = {
    fromDate: { field: 'Date', type: 'ge', data: args.fromDate },
    toDate: { field: 'Date', type: 'le', data: toDate },
  }

  // Narrow server-side when the name resolves to exactly one employee.
  const matchedIds = args.employeeName ? resolveEmployeeIds(employeeMap, args.employeeName) : []
  if (args.employeeName && matchedIds.length === 1) {
    search.employee = { field: 'Employee', type: 'eq', data: matchedIds[0] }
  }

  let records = await deputyQuery<DeputyTimesheet>(userId, 'Timesheet', { search })

  // Post-filter for ambiguous names and the in-progress flag.
  if (args.employeeName && matchedIds.length > 1) {
    const idSet = new Set(matchedIds)
    records = records.filter(record => idSet.has(record.Employee))
  }
  if (args.onlyInProgress) records = records.filter(record => record.IsInProgress === true)

  records.sort((a, b) => (a.StartTime ?? 0) - (b.StartTime ?? 0))

  const timesheets: DeputyTimesheetRow[] = records.map(record => {
    const { start, end } = shiftTimes(record)
    return {
      employee: employeeMap.get(record.Employee)?.name ?? `Employee ${record.Employee}`,
      date: record.Date ?? null,
      start,
      end,
      hours: shiftHours(record),
      mealbreak_minutes: typeof record.Mealbreak === 'number' ? record.Mealbreak : null,
      area: record.OperationalUnit ? unitMap.get(record.OperationalUnit) ?? null : null,
      in_progress: record.IsInProgress === true,
      approved: record.TimeApproved === true,
    }
  })

  const totalsByEmployee = new Map<string, { total: number; shifts: number }>()
  for (const row of timesheets) {
    const current = totalsByEmployee.get(row.employee) ?? { total: 0, shifts: 0 }
    current.total += row.hours ?? 0
    current.shifts += 1
    totalsByEmployee.set(row.employee, current)
  }
  const byEmployee: DeputyEmployeeHours[] = Array.from(totalsByEmployee.entries())
    .map(([employee, { total, shifts }]) => ({ employee, total_hours: round2(total), shifts }))
    .sort((a, b) => b.total_hours - a.total_hours)

  return {
    range: { from: args.fromDate, to: toDate },
    employee_filter: args.employeeName ?? null,
    unresolved_employee: Boolean(args.employeeName) && matchedIds.length === 0,
    total_hours: round2(byEmployee.reduce((sum, entry) => sum + entry.total_hours, 0)),
    by_employee: byEmployee,
    timesheets,
  }
}

interface RosterArgs {
  fromDate: string
  toDate?: string
  employeeName?: string
  openOnly?: boolean
}

/**
 * Rosters = scheduled shifts. Answers "who is working tomorrow / this week".
 */
export async function getDeputyRosters(userId: string, args: RosterArgs): Promise<{
  range: { from: string; to: string }
  employee_filter: string | null
  unresolved_employee: boolean
  total_shifts: number
  by_employee: DeputyEmployeeHours[]
  rosters: DeputyRosterRow[]
}> {
  const [employeeMap, unitMap] = await Promise.all([
    fetchDeputyEmployeeMap(userId),
    fetchDeputyOperationalUnitMap(userId),
  ])

  const toDate = args.toDate ?? args.fromDate
  // StartTime is mandatory on Roster; Date is optional and often date-time shaped.
  const search: Record<string, DeputyQuerySearchCondition> = {
    fromStart: { field: 'StartTime', type: 'ge', data: storeDayStartUnix(args.fromDate) },
    toStart: { field: 'StartTime', type: 'le', data: storeDayEndUnix(toDate) },
  }

  const matchedIds = args.employeeName ? resolveEmployeeIds(employeeMap, args.employeeName) : []
  if (args.employeeName && matchedIds.length === 1) {
    search.employee = { field: 'Employee', type: 'eq', data: matchedIds[0] }
  }

  let records = await deputyQuery<DeputyRoster>(userId, 'Roster', { search })

  if (args.employeeName && matchedIds.length > 1) {
    const idSet = new Set(matchedIds)
    records = records.filter(record => idSet.has(record.Employee))
  }
  if (args.openOnly) records = records.filter(record => record.Open === true)

  records = records.filter(record => {
    const day = normalizeStoreDate(record.Date, record.StartTime)
    return day !== null && day >= args.fromDate && day <= toDate
  })

  records.sort((a, b) => (a.StartTime ?? 0) - (b.StartTime ?? 0))

  const rosters: DeputyRosterRow[] = records.map(record => {
    const { start, end } = shiftTimes(record)
    const open = record.Open === true || !record.Employee
    return {
      employee: open ? 'Open shift (unassigned)' : employeeMap.get(record.Employee)?.name ?? `Employee ${record.Employee}`,
      date: normalizeStoreDate(record.Date, record.StartTime),
      start,
      end,
      hours: shiftHours(record),
      area: record.OperationalUnit ? unitMap.get(record.OperationalUnit) ?? null : null,
      open,
      published: record.Published === true,
      comment: typeof record.Comment === 'string' && record.Comment.trim() ? record.Comment.trim() : null,
    }
  })

  const totalsByEmployee = new Map<string, { total: number; shifts: number }>()
  for (const row of rosters) {
    const current = totalsByEmployee.get(row.employee) ?? { total: 0, shifts: 0 }
    current.total += row.hours ?? 0
    current.shifts += 1
    totalsByEmployee.set(row.employee, current)
  }
  const byEmployee: DeputyEmployeeHours[] = Array.from(totalsByEmployee.entries())
    .map(([employee, { total, shifts }]) => ({ employee, total_hours: round2(total), shifts }))
    .sort((a, b) => b.total_hours - a.total_hours)

  return {
    range: { from: args.fromDate, to: toDate },
    employee_filter: args.employeeName ?? null,
    unresolved_employee: Boolean(args.employeeName) && matchedIds.length === 0,
    total_shifts: rosters.length,
    by_employee: byEmployee,
    rosters,
  }
}

/**
 * /me — the authenticated Deputy user (used on connect to label the account).
 */
export async function getDeputyMe(userId: string): Promise<{
  name: string | null
  employee_id: number | null
  company: number | null
} | null> {
  try {
    const me = await deputyGet<Record<string, unknown>>(userId, '/me')
    if (!me) return null
    const company = Array.isArray(me.Company) ? (me.Company[0] as number | undefined) ?? null : (me.Company as number | undefined) ?? null
    return {
      name: typeof me.Name === 'string' ? me.Name : null,
      employee_id: typeof me.EmployeeId === 'number' ? me.EmployeeId : (typeof me.Id === 'number' ? me.Id : null),
      company,
    }
  } catch (error) {
    console.warn('[Deputy] /me lookup failed:', error)
    return null
  }
}

/** Best-effort primary company/business name for display. */
export async function getDeputyCompanyName(userId: string): Promise<string | null> {
  try {
    const companies = await deputyGet<Array<Record<string, unknown>>>(userId, '/resource/Company')
    const list = Array.isArray(companies) ? companies : []
    const business = list.find(company => company.CompanyName && company.IsWorkplace !== false) ?? list[0]
    return business && typeof business.CompanyName === 'string' ? business.CompanyName : null
  } catch (error) {
    console.warn('[Deputy] company lookup failed:', error)
    return null
  }
}
