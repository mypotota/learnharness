import { inspectClaudeInstallation } from "../agent/claude-code/installation.ts";
import { initAuthEnv } from "./keys.ts";
import { subscriptionRequestOrigin } from "./web-subscription-http.ts";
import { errorFields } from "./error-response.ts";
import { claudeCodeEnabled } from "./claude-code-config.ts";

/** The Settings status seam: initialize provenance before any child env is copied. */
export async function claudeCodeInstallationStatus() {
	initAuthEnv();
	return inspectClaudeInstallation();
}

/** Same-origin browser intent, not user authentication. No CORS grants.
 * A public/shared server still requires its own access-control boundary. */
export async function claudeCodeInstallationResponse(
	request: Request,
	inspect = claudeCodeInstallationStatus,
	enabled = claudeCodeEnabled,
): Promise<Response> {
	const origin = subscriptionRequestOrigin(request);
	const supplied = request.headers.get("origin");
	const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
	if (request.method !== "GET" || !origin
		|| request.headers.get("x-learnharness-claude-code") !== "1"
		|| request.headers.get("sec-fetch-site") === "cross-site"
		|| (supplied !== null && supplied !== origin)) {
		return Response.json(errorFields("claude_code.same_origin_required"), { status: 403, headers });
	}
	if (!enabled()) return Response.json(errorFields("claude_code.disabled"), { status: 403, headers });
	return Response.json(await inspect(), { headers });
}
