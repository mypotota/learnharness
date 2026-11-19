/**
 * THE STATS AREA (简体中文): 与 en/stats.ts 一一对应。
 */

import type { Translated } from "../types.ts";
import type { stats as EN_STATS } from "../en/stats.ts";

export const stats = {
	title: "会话统计",
	contextLastCall: "上下文（上次调用）",
	cliWindowNote: "窗口大小由 Claude Code 报告；自动压缩后可能更低。",
	usage: "用量",
	totalCost: "总花费",
	cacheHitRate: "缓存命中率",
	manageChatgptUsage: "管理 ChatGPT 用量",
	unpricedTurns: "未计价的轮次",
	turns: "轮次",
	steps: "{count} 步",
} satisfies Translated<typeof EN_STATS>;
