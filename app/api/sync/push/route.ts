/**
 * POST /api/sync/push — build a package from this device's data, upload it,
 * then move the pointer. A conflict answers 409 with the conflict kind;
 * `{ force: true, confirm: "overwrite-remote" }` overrides it.
 */

import { pushSync, SyncServiceError } from "@/src/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
	const body = (await request.json().catch(() => ({}))) as { force?: unknown; confirm?: unknown };
	try {
		const result = await pushSync({ force: body.force === true, confirm: typeof body.confirm === "string" ? body.confirm : undefined });
		return Response.json(result, { status: result.kind === "conflict" ? 409 : 200 });
	} catch (error) {
		if (error instanceof SyncServiceError) {
			return Response.json({ error: error.message }, { status: error.status });
		}
		return Response.json({ error: error instanceof Error ? error.message : "Push failed." }, { status: 500 });
	}
}
