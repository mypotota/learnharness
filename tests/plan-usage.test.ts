import assert from "node:assert/strict";
import { test } from "node:test";
import { parseMiniMaxRemains, parseZhipuQuota } from "../src/core/plan-usage.ts";
import { planUsageResponse } from "../src/server/plan-usage.ts";

function request(headers: Record<string, string> = {}, query = "?provider=minimax-cn") {
	return new Request(`http://localhost:3000/api/usage/plan${query}`, { headers: { "x-learnharness-usage": "1", ...headers } });
}

test("MiniMax: the general row drives both windows and video rows are ignored", () => {
	const parsed = parseMiniMaxRemains({
		model_remains: [
			{ model_name: "video", current_interval_remaining_percent: 3, end_time: 1 },
			{
				model_name: "general",
				current_interval_remaining_percent: 72,
				end_time: 1_700_000_000_000,
				current_weekly_remaining_percent: 41,
				weekly_end_time: 1_700_500_000_000,
			},
		],
	});
	assert.deepEqual(parsed, {
		fiveHour: { remainingPercent: 72, resetsAt: 1_700_000_000_000 },
		weekly: { remainingPercent: 41, resetsAt: 1_700_500_000_000 },
	});
});

test("MiniMax: a missing weekly percentage leaves the weekly window null", () => {
	const parsed = parseMiniMaxRemains({
		model_remains: [{ model_name: "general", current_interval_remaining_percent: 88, end_time: 1 }],
	});
	assert.deepEqual(parsed, { fiveHour: { remainingPercent: 88, resetsAt: 1 }, weekly: null });
});

test("MiniMax: percentages are clamped and rounded; quoted values are accepted", () => {
	const parsed = parseMiniMaxRemains({
		model_remains: [{ model_name: "general", current_interval_remaining_percent: "150", current_weekly_remaining_percent: -8 }],
	});
	assert.deepEqual(parsed, {
		fiveHour: { remainingPercent: 100, resetsAt: null },
		weekly: { remainingPercent: 0, resetsAt: null },
	});
});

test("MiniMax: malformed payloads parse to null", () => {
	for (const payload of [null, {}, { model_remains: "nope" }, { model_remains: [{ model_name: "video", current_interval_remaining_percent: 5 }] }]) {
		assert.equal(parseMiniMaxRemains(payload), null);
	}
});

test("智谱: unit 3 is the 5-hour window, unit 6 weekly, unit 5 is ignored", () => {
	const parsed = parseZhipuQuota({
		data: {
			limits: [
				{ type: "TIME_LIMIT", unit: 5, percentage: 12, nextResetTime: 1 },
				{ type: "TOKENS_LIMIT", unit: 5, percentage: 99, nextResetTime: 2 },
				{ type: "TOKENS_LIMIT", unit: 3, percentage: 25, nextResetTime: 1_700_000_000_000 },
				{ type: "TOKENS_LIMIT", unit: 6, percentage: 80, nextResetTime: "2026-11-28T00:00:00.000Z" },
			],
		},
	});
	assert.deepEqual(parsed, {
		fiveHour: { remainingPercent: 75, resetsAt: 1_700_000_000_000 },
		weekly: { remainingPercent: 20, resetsAt: Date.parse("2026-11-28T00:00:00.000Z") },
	});
});

test("智谱: the weekly window is null when the account does not expose unit 6", () => {
	const parsed = parseZhipuQuota({
		data: { limits: [{ type: "TOKENS_LIMIT", unit: 3, percentage: 5 }] },
	});
	assert.deepEqual(parsed, { fiveHour: { remainingPercent: 95, resetsAt: null }, weekly: null });
});

test("Z.AI coding plan: CREDIT_LIMIT unit 3/6 rows parse like TOKENS_LIMIT", () => {
	const parsed = parseZhipuQuota({
		data: {
			limits: [
				{ type: "CREDIT_LIMIT", unit: 3, percentage: 4, nextResetTime: 1_795_261_736_637 },
				{ type: "CREDIT_LIMIT", unit: 6, percentage: 1, nextResetTime: 1_795_789_828_984 },
			],
			level: "lite",
		},
	});
	assert.deepEqual(parsed, {
		fiveHour: { remainingPercent: 96, resetsAt: 1_795_261_736_637 },
		weekly: { remainingPercent: 99, resetsAt: 1_795_789_828_984 },
	});
});

test("智谱: malformed payloads parse to null", () => {
	for (const payload of [null, {}, { data: {} }, { data: { limits: [{ type: "TIME_LIMIT", unit: 5, percentage: 1 }] } }]) {
		assert.equal(parseZhipuQuota(payload), null);
	}
});

for (const headers of [
	{ origin: "https://attacker.invalid" },
	{ "sec-fetch-site": "cross-site" },
	{ "x-learnharness-usage": "" },
] as Record<string, string>[]) test(`unsafe plan-usage request ${JSON.stringify(headers)} is refused`, async () => {
	const response = await planUsageResponse(request(headers));
	assert.equal(response.status, 403);
	assert.deepEqual(await response.json(), { usage: null });
	assert.equal(response.headers.get("access-control-allow-origin"), null);
});

test("an unsupported provider yields no usage without a network call", async () => {
	const response = await planUsageResponse(request({}, "?provider=openai"));
	assert.equal(response.status, 200);
	assert.equal(response.headers.get("cache-control"), "no-store");
	assert.deepEqual(await response.json(), { usage: null });
});
