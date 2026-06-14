/**
 * Deputy Integration Types
 */

export interface DeputyConnection {
  id: string
  user_id: string
  status: 'connected' | 'disconnected' | 'error' | 'expired'

  // Per-install API host returned by Deputy on connect: {install}.{geo}.deputy.com
  endpoint: string | null
  install_name: string | null
  geo: string | null

  // Display / context
  account_name: string | null
  company_name: string | null
  deputy_employee_id: string | null

  access_token_encrypted: string | null
  refresh_token_encrypted: string | null
  token_expires_at: string | null

  oauth_state: string | null
  oauth_state_expires_at: string | null

  scopes: string[] | null
  connected_at: string | null
  disconnected_at: string | null
  last_token_refresh_at: string | null
  last_error: string | null
  last_error_at: string | null
  error_count: number
  created_at: string
  updated_at: string
}

export interface DeputyTokenResponse {
  access_token: string
  refresh_token: string
  expires_in: number
  token_type: string
  scope?: string
  /** {install}.{geo}.deputy.com — the store-specific API host. */
  endpoint: string
}

// ---- Resource API records (subset of fields the Genie uses) ----

export interface DeputyEmployee {
  Id: number
  DisplayName?: string | null
  FirstName?: string | null
  LastName?: string | null
  Active?: boolean | null
  Company?: number | null
}

export interface DeputyTimesheet {
  Id: number
  Employee: number
  Date?: string | null
  StartTime?: number | null
  EndTime?: number | null
  StartTimeLocalized?: string | null
  EndTimeLocalized?: string | null
  Mealbreak?: number | null
  TotalTime?: number | null
  Cost?: number | null
  IsInProgress?: boolean | null
  OperationalUnit?: number | null
  TimeApproved?: boolean | null
}

export interface DeputyRoster {
  Id: number
  Employee: number
  Date?: string | null
  StartTime?: number | null
  EndTime?: number | null
  StartTimeLocalized?: string | null
  EndTimeLocalized?: string | null
  Mealbreak?: number | null
  TotalTime?: number | null
  OperationalUnit?: number | null
  Open?: boolean | null
  Published?: boolean | null
  Comment?: string | null
}

export interface DeputyOperationalUnit {
  Id: number
  OperationalUnitName?: string | null
  Company?: number | null
}

// ---- Compact, LLM-friendly shapes returned by the client helpers ----

export interface DeputyEmployeeSummary {
  id: number
  name: string
  active: boolean
}

export interface DeputyTimesheetRow {
  employee: string
  date: string | null
  start: string | null
  end: string | null
  hours: number | null
  mealbreak_minutes: number | null
  area: string | null
  in_progress: boolean
  approved: boolean
}

export interface DeputyEmployeeHours {
  employee: string
  total_hours: number
  shifts: number
}

export interface DeputyRosterRow {
  employee: string
  date: string | null
  start: string | null
  end: string | null
  hours: number | null
  area: string | null
  open: boolean
  published: boolean
  comment: string | null
}
