/**
 * POST /api/sync/test — authenticate against the WebDAV root and compare
 * the local tree with the remote pointer without moving any data.
 */

import { SyncServiceError, testSyncConnection } from "@/src/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
	try {
		return Response.json(await testSyncConnection(), { headers: { "Cache-Control": "no-store" } });
	} catch (error) {
		if (error instanceof SyncServiceError) {
			return Response.json(
				{ error: error.message, ...(error.detail === undefined ? {} : { detail: error.detail }) },
				{ status: error.status },
			);
		}
		throw error;
	}
}
