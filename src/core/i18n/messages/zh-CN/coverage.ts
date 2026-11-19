/**
 * THE COVERAGE AREA (简体中文): 与 en/coverage.ts 一一对应。
 */

import type { Translated } from "../types.ts";
import type { coverage as EN_COVERAGE } from "../en/coverage.ts";

export const coverage = {
	hint: "这个会话还有多少内容未被纳入图谱",
	title: "抽取覆盖率",
	uncovered: "未覆盖",
	covered: "已覆盖",
	messages: "消息",
	chunkThreshold: "分块阈值",
	lastExtraction: "上次抽取",
	status: "状态",
	extracting: "抽取中…",
	fullyExtracted: "已全部抽取",
	tokUncovered: "{tokens} token 未覆盖",
	unextracted: "{count} 条消息未抽取",
	running: "运行中",
	extract: "抽取",
	tokens: "{tokens} token",
} satisfies Translated<typeof EN_COVERAGE>;
