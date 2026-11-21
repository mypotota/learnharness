/**
 * Plan-usage fetch seam (usage-query wave, 2026-11-21): resolves ONE model
 * provider to its subscription-quota endpoint and returns the normalized
 * 5-hour / 7-day windows. Credentials stay server-side — the browser only
 * ever sees the parsed percentages.
 *
 * Sources (owner-approved):
 *   minimax-cn     → MINIMAX_CN_API_KEY from the normal key store/env
 *   zai-coding-cn  → ZAI_CODING_CN_API_KEY against open.bigmodel.cn's quota
 *                    endpoint (CREDIT_LIMIT rows)
 *   claude-code    → the 智谱 GLM Anthropic-compatible connection: its token
 *                    and base URL come from the CLI's own environment
 *                    (process env first, then ~/.claude/settings.json)
 *
 * Any other provider has no plan endpoint: the response is `usage: null`
 * and the UI renders no entry at all.
 */

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { CLAUDE_CODE_PROVIDER } from "../agent/claude-code/constants.ts";
import { parseMiniMaxRemains, parseZhipuQuota, type PlanUsage, type PlanUsageResponse } from "../core/plan-usage.ts";
import { initAuthEnv, keyValue } from "./keys.ts";
import { subscriptionRequestOrigin } from "./desktop-access.ts";

const MINIMAX_CN_PROVIDER = "minimax-cn";
const ZAI_CODING_CN_PROVIDER = "zai-coding-cn";
const MINIMAX_REMAINS_URL = "https://api.minimaxi.com/v1/api/openplatform/coding_plan/remains";
const ZHIPU_BIGMODEL_QUOTA_URL = "https://open.bigmodel.cn/api/monitor/usage/quota/limit";
const ZHIPU_ZAI_QUOTA_URL = "https://api.z.ai/api/monitor/usage/quota/limit";

const HEADERS = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" };

/** The CLI settings file's `env` block — the fallback when this process was
 *  not itself launched by Claude Code. Malformed/missing files are normal. */
function claudeSettingsEnv(): Record<string, string> {
	try {
		const parsed: unknown = JSON.parse(readFileSync(join(homedir(), ".claude", "settings.json"), "utf8"));
		const env = (parsed as { env?: unknown })?.env;
		if (!env || typeof env !== "object") return {};
		const entries = Object.entries(env as Record<string, unknown>)
			.filter((entry): entry is [string, string] => typeof entry[1] === "string");
		return Object.fromEntries(entries);
	} catch {
		return {};
	}
}

async function requestJson(url: string, token: string): Promise<unknown | null> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), 8000);
	try {
		const response = await fetch(url, {
			headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
			cache: "no-store",
			signal: controller.signal,
		});
		if (!response.ok) return null;
		return await response.json();
	} catch {
		return null;
	} finally {
		clearTimeout(timer);
	}
}

/**
 * Fetch one provider's plan usage. Null means "no data" for every reason
 * (unsupported provider, missing credential, network error, malformed
 * payload) — the UI's entry is presence-driven, so there is nothing to
 * distinguish client-side.
 */
export async function readPlanUsage(provider: string): Promise<PlanUsage | null> {
	initAuthEnv();
	const fetchedAt = Date.now();
	if (provider === MINIMAX_CN_PROVIDER) {
		const key = keyValue("MINIMAX_CN_API_KEY");
		if (!key) return null;
		const parsed = parseMiniMaxRemains(await requestJson(MINIMAX_REMAINS_URL, key));
		return parsed ? { provider, ...parsed, fetchedAt } : null;
	}
	if (provider === ZAI_CODING_CN_PROVIDER) {
		const key = keyValue("ZAI_CODING_CN_API_KEY");
		if (!key) return null;
		const parsed = parseZhipuQuota(await requestJson(ZHIPU_BIGMODEL_QUOTA_URL, key));
		return parsed ? { provider, ...parsed, fetchedAt } : null;
	}
	if (provider === CLAUDE_CODE_PROVIDER) {
		const settings = claudeSettingsEnv();
		const token = process.env.ANTHROPIC_AUTH_TOKEN || settings.ANTHROPIC_AUTH_TOKEN;
		if (!token) return null;
		const baseUrl = process.env.ANTHROPIC_BASE_URL || settings.ANTHROPIC_BASE_URL || "";
		const url = /z\.ai/i.test(baseUrl) ? ZHIPU_ZAI_QUOTA_URL : ZHIPU_BIGMODEL_QUOTA_URL;
		const parsed = parseZhipuQuota(await requestJson(url, token));
		return parsed ? { provider, ...parsed, fetchedAt } : null;
	}
	return null;
}

/** GET /api/usage/plan — same-origin browser intent only (no CORS grants). */
export async function planUsageResponse(request: Request): Promise<Response> {
	const origin = subscriptionRequestOrigin(request);
	const supplied = request.headers.get("origin");
	if (request.method !== "GET" || !origin
		|| request.headers.get("x-learnharness-usage") !== "1"
		|| request.headers.get("sec-fetch-site") === "cross-site"
		|| (supplied !== null && supplied !== origin)) {
		return Response.json({ usage: null } satisfies PlanUsageResponse, { status: 403, headers: HEADERS });
	}
	const provider = new URL(request.url).searchParams.get("provider") ?? "";
	const usage = await readPlanUsage(provider);
	return Response.json({ usage } satisfies PlanUsageResponse, { headers: HEADERS });
}
