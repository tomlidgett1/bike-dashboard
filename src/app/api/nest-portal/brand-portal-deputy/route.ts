// Auto-generated thin wrapper: runs the ported Nest brand-portal handler
// (src/lib/nest-portal/api/brand-portal-deputy.ts) via the Vercel->Next adapter. Do not add logic here.
import { type NextRequest } from "next/server";
import handler from "@/lib/nest-portal/api/brand-portal-deputy";
import { runVercelHandler } from "@/lib/nest-portal/vercel-adapter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export function GET(req: NextRequest) { return runVercelHandler(handler, req); }
export function POST(req: NextRequest) { return runVercelHandler(handler, req); }
export function PATCH(req: NextRequest) { return runVercelHandler(handler, req); }
export function PUT(req: NextRequest) { return runVercelHandler(handler, req); }
export function DELETE(req: NextRequest) { return runVercelHandler(handler, req); }
export function OPTIONS(req: NextRequest) { return runVercelHandler(handler, req); }
