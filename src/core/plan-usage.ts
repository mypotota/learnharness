/**
 * Plan-usage contracts + provider parsers (usage-query wave, 2026-11-21).
 *
 * Two subscription plans expose the same idea through different JSON:
 * MiniMax CN's coding-plan `remains` payload and 智谱 GLM's quota `limits`
 * payload. The client only needs the two windows the owner decided on —
 * the 5-hour interval and the 7-day week — each as REMAINING percent plus
 * its reset instant. Pure functions; no network, no node builtins.
 */

/** One quota window. Percentages are always 0–100 REMAINING (not used). */
export interface PlanUsageWindow {
	remainingPercent: number;
	/** Epoch ms of the next reset, or null when the provider omits it. */
	resetsAt: number | null;
}

export interface PlanUsage {
	/** The model provider id the windows belong to. */
	provider: string;
	/** Null when this plan does not report the 5-hour window. */
	fiveHour: PlanUsageWindow | null;
	/** Null when this plan does not report the 7-day window. */
	weekly: PlanUsageWindow | null;
	/** Epoch ms when this snapshot was fetched. */
	fetchedAt: number;
}

/** GET /api/usage/plan response. `usage: null` means "nothing to show". */
export interface PlanUsageResponse {
	usage: PlanUsage | null;
}

/** Coerce a provider percentage to a clamped integer 0–100. Strings are
 *  accepted because both APIs have shipped quoted numbers. */
function percentOf(value: unknown): number | null {
	const numeric = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
	if (!Number.isFinite(numeric)) return null;
	return Math.round(Math.min(100, Math.max(0, numeric)));
}

/** Coerce a reset instant to epoch ms. Accepts ms numbers and ISO strings. */
function instantOf(value: unknown): number | null {
	if (typeof value === "number") return Number.isFinite(value) && value > 0 ? value : null;
	if (typeof value === "string") {
		const parsed = Date.parse(value);
		return Number.isFinite(parsed) ? parsed : null;
	}
	return null;
}

/** MiniMax CN coding plan: `model_remains[]` carries one row per model. The
 *  "general" row is the plan everything routes through; "video" rows are a
 *  different allowance and must never be shown as conversation usage. Both
 *  windows there are already REMAINING percentages. */
export function parseMiniMaxRemains(json: unknown): { fiveHour: PlanUsageWindow | null; weekly: PlanUsageWindow | null } | null {
	if (!json || typeof json !== "object") return null;
	const rows = (json as { model_remains?: unknown }).model_remains;
	if (!Array.isArray(rows)) return null;
	type Row = {
		model_name?: unknown;
		current_interval_remaining_percent?: unknown;
		end_time?: unknown;
		current_weekly_remaining_percent?: unknown;
		weekly_end_time?: unknown;
	};
	const usable = rows.filter((row): row is Row => !!row && typeof row === "object");
	const row = usable.find((candidate) => candidate.model_name === "general")
		?? usable.find((candidate) => candidate.model_name !== "video");
	if (!row) return null;
	const five = percentOf(row.current_interval_remaining_percent);
	const weekly = percentOf(row.current_weekly_remaining_percent);
	const fiveHour = five === null ? null : { remainingPercent: five, resetsAt: instantOf(row.end_time) };
	const week = weekly === null ? null : { remainingPercent: weekly, resetsAt: instantOf(row.weekly_end_time) };
	if (!fiveHour && !week) return null;
	return { fiveHour, weekly: week };
}

/** 智谱 / Z.AI quota limits: each row is `{type, unit, percentage,
 *  nextResetTime}`. Both `TOKENS_LIMIT` (the anthropic-compatible endpoint)
 *  and `CREDIT_LIMIT` (the Z.AI coding plan) describe the same windows: unit
 *  3 is the 5-hour window, unit 6 the 7-day one. Unit 5 / `TIME_LIMIT` is the
 *  monthly web-tool allowance and is deliberately ignored. The API reports
 *  USED percent — this parser flips it to remaining at the boundary. */
export function parseZhipuQuota(json: unknown): { fiveHour: PlanUsageWindow | null; weekly: PlanUsageWindow | null } | null {
	if (!json || typeof json !== "object") return null;
	const limits = (json as { data?: { limits?: unknown } }).data?.limits;
	if (!Array.isArray(limits)) return null;
	let fiveHour: PlanUsageWindow | null = null;
	let weekly: PlanUsageWindow | null = null;
	for (const row of limits) {
		if (!row || typeof row !== "object") continue;
		const entry = row as { type?: unknown; unit?: unknown; percentage?: unknown; nextResetTime?: unknown };
		if (entry.type !== "TOKENS_LIMIT" && entry.type !== "CREDIT_LIMIT") continue;
		const unit = typeof entry.unit === "number" ? entry.unit : Number(entry.unit);
		const used = percentOf(entry.percentage);
		if (used === null) continue;
		const window = { remainingPercent: 100 - used, resetsAt: instantOf(entry.nextResetTime) };
		if (unit === 3 && !fiveHour) fiveHour = window;
		else if (unit === 6 && !weekly) weekly = window;
	}
	if (!fiveHour && !weekly) return null;
	return { fiveHour, weekly };
}
