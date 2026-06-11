/**
 * Xero Integration Types
 */

export interface XeroConnection {
  id: string
  user_id: string
  status: 'connected' | 'disconnected' | 'error' | 'expired'
  tenant_id: string | null
  tenant_name: string | null
  tenant_type: string | null
  organisation_name: string | null
  base_currency: string | null
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

export interface XeroTokenResponse {
  access_token: string
  refresh_token: string
  expires_in: number
  token_type: string
  scope?: string
  id_token?: string
}

/** Entry from GET https://api.xero.com/connections */
export interface XeroTenantConnection {
  id: string
  authEventId: string
  tenantId: string
  tenantType: string
  tenantName: string | null
  createdDateUtc: string
  updatedDateUtc: string
}

// ---- Report structures (ReportWithRows) ----

export interface XeroReportCell {
  Value?: string
  Attributes?: Array<{ Value: string; Id: string }>
}

export interface XeroReportRow {
  RowType: 'Header' | 'Section' | 'Row' | 'SummaryRow'
  Title?: string
  Cells?: XeroReportCell[]
  Rows?: XeroReportRow[]
}

export interface XeroReport {
  ReportID?: string
  ReportName: string
  ReportType: string
  ReportTitles?: string[]
  ReportDate?: string
  UpdatedDateUTC?: string
  Rows: XeroReportRow[]
}

export interface XeroReportResponse {
  Reports?: XeroReport[]
}

/** Compact, LLM-friendly flattened report */
export interface FlattenedXeroReport {
  report_name: string
  report_titles: string[]
  columns: string[]
  sections: Array<{
    title: string
    rows: Array<{ label: string; values: string[]; is_summary: boolean }>
  }>
}
