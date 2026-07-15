import { NextResponse } from "next/server";
import {
  requireStoreUser,
  type StoreAuth,
} from "@/lib/customer-inquiries/auth";

export async function requireSupplierScraperManager(): Promise<
  StoreAuth | { error: NextResponse }
> {
  const auth = await requireStoreUser();
  if ("error" in auth) return auth;

  if (auth.role !== "owner" && auth.role !== "manager") {
    return {
      error: NextResponse.json(
        { error: "Only store owners and managers can manage supplier scrapers." },
        { status: 403 },
      ),
    };
  }

  return auth;
}
