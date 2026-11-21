/**
 * POST /api/sync/pull — download the remote package, verify every byte,
 * back up the current data, then swap it in. A conflict answers 409 with the
 * conflict kind; `{ force: true, confirm: "replace-local" }` overrides it.
 */

import { pullSync, SyncServiceError } from "@/src/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
	const body = (await request.json().catch(() => ({}))) as { force?: unknown; confirm?: unknown };
	try {
		const result = await pullSync({ force: body.force === true, confirm: typeof body.confirm === "string" ? body.confirm : undefined });
		return Response.json(result, { status: result.kind === "conflict" ? 409 : 200 });
	} catch (error) {
		if (error instanceof SyncServiceError) {
			return Response.json({ error: error.message }, { status: error.status });
		}
		return Response.json({ error: error instanceof Error ? error.message : "Pull failed." }, { status: 500 });
	}
}
