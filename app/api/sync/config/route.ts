/**
 * PUT /api/sync/config — save the WebDAV endpoint + credential. An empty
 * password means "keep the saved one"; the response never echoes it.
 * DELETE — forget the local configuration (remote packages stay).
 */

import { deleteSyncConfig, saveSyncConfig, SyncServiceError } from "@/src/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PUT(request: Request) {
	const body = await request.json().catch(() => ({}));
	try {
		return Response.json(saveSyncConfig(body as Record<string, unknown>), { headers: { "Cache-Control": "no-store" } });
	} catch (error) {
		if (error instanceof SyncServiceError) {
			return Response.json({ error: error.message }, { status: error.status });
		}
		throw error;
	}
}

export async function DELETE() {
	return Response.json(deleteSyncConfig(), { headers: { "Cache-Control": "no-store" } });
}
