import type { StoreAuth } from "@/lib/customer-inquiries/auth";
import {
  DEFAULT_FIELD_MAPPING,
  type FieldMapping,
} from "@/lib/scrapers/fesports-field-mapping";
import type {
  StoredSupplierScraper,
  SupplierScraperConfig,
  SupplierScraperStatus,
} from "@/lib/scrapers/supplier-types";

export interface SupplierScraperRow {
  id: string;
  store_id: string | null;
  owner_user_id: string;
  created_by: string;
  name: string;
  base_url: string;
  login_url: string;
  credential_ciphertext: string;
  config: SupplierScraperConfig;
  field_mapping: FieldMapping;
  status: SupplierScraperStatus;
  last_run_at: string | null;
  last_run_status: "running" | "succeeded" | "failed" | null;
  last_run_summary: Record<string, unknown> | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

const PUBLIC_COLUMNS = [
  "id",
  "name",
  "base_url",
  "login_url",
  "config",
  "field_mapping",
  "status",
  "last_run_at",
  "last_run_status",
  "last_run_summary",
  "last_error",
  "created_at",
  "updated_at",
].join(",");

export function toStoredSupplierScraper(
  row: Omit<SupplierScraperRow, "credential_ciphertext"> & {
    credential_ciphertext?: string;
  },
): StoredSupplierScraper {
  return {
    id: row.id,
    name: row.name,
    baseUrl: row.base_url,
    loginUrl: row.login_url,
    credentialSaved: true,
    status: row.status,
    config: row.config,
    fieldMapping:
      row.field_mapping && Object.keys(row.field_mapping).length > 0
        ? row.field_mapping
        : DEFAULT_FIELD_MAPPING,
    lastRunAt: row.last_run_at,
    lastRunStatus: row.last_run_status,
    lastRunSummary: row.last_run_summary ?? {},
    lastError: row.last_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listSupplierScrapers(
  auth: StoreAuth,
): Promise<StoredSupplierScraper[]> {
  const { data, error } = await auth.supabase
    .from("store_supplier_scrapers")
    .select(PUBLIC_COLUMNS)
    .eq("owner_user_id", auth.user.id)
    .neq("status", "archived")
    .order("updated_at", { ascending: false });

  if (error) {
    throw new Error(`Could not load supplier scrapers: ${error.message}`);
  }

  return ((data ?? []) as unknown as Array<
    Omit<SupplierScraperRow, "credential_ciphertext">
  >).map(toStoredSupplierScraper);
}

export async function loadSupplierScraperRow(
  auth: StoreAuth,
  scraperId: string,
): Promise<SupplierScraperRow> {
  const { data, error } = await auth.supabase
    .from("store_supplier_scrapers")
    .select("*")
    .eq("id", scraperId)
    .eq("owner_user_id", auth.user.id)
    .neq("status", "archived")
    .maybeSingle();

  if (error) {
    throw new Error(`Could not load supplier scraper: ${error.message}`);
  }
  if (!data) {
    throw new Error("Supplier scraper not found.");
  }
  return data as unknown as SupplierScraperRow;
}
