/**
 * GET /api/sync/status — the Settings → Sync card's whole state: config
 * presence (never the password), local data size, last known remote seq and
 * package size, progress, conflicts and the last error.
 */

import { syncStatus } from "@/src/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
	return Response.json(syncStatus(), { headers: { "Cache-Control": "no-store" } });
}
