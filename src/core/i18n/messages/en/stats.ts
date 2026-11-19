/**
 * THE STATS AREA (i18n wave, 2026-11-19): the below-composer session
 * stats bar — the summary popover's usage, cost and per-turn rows.
 *
 * The English text IS today's wording, exactly.
 */

export const stats = {
	title: "Session stats",
	contextLastCall: "Context (last call)",
	cliWindowNote: "Window reported by Claude Code; may be lower for auto-compaction.",
	usage: "Usage",
	totalCost: "Total cost",
	cacheHitRate: "Cache hit rate",
	manageChatgptUsage: "Manage ChatGPT usage",
	unpricedTurns: "Unpriced turns",
	turns: "Turns",
	steps: "{count} steps",
} as const;
