/**
 * POST /api/sync/now — the top-bar control's one tap. Pull when this device
 * is clean and the server is ahead, push when this device changed and the
 * server is untouched, stop with the conflict otherwise (never forces).
 * A running turn/job answers 409 so the control can say "try again later".
 */

import { syncNow, SyncServiceError } from "@/src/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
	try {
		const result = await syncNow();
		return Response.json(result, { status: result.kind === "conflict" ? 409 : 200 });
	} catch (error) {
		if (error instanceof SyncServiceError) {
			return Response.json({ error: error.message, errorCode: error.code }, { status: error.status });
		}
		return Response.json({ error: error instanceof Error ? error.message : "Sync failed." }, { status: 500 });
	}
}
