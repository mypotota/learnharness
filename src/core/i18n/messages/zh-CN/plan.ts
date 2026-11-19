/**
 * THE PLAN AREA (简体中文): 与 en/plan.ts 一一对应。
 */

import type { Translated } from "../types.ts";
import type { plan as EN_PLAN } from "../en/plan.ts";

export const plan = {
	diagram: "计划图",
	openFull: "打开完整计划",
	fullTitle: "完整计划",
	title: "计划",
	liveNote: "实时 — 状态随你的答题结果更新",
	close: "关闭",
	panHint: "拖动平移 · 滚轮缩放",
	zoomOut: "缩小",
	fit: "计划图适配屏幕",
	zoomIn: "放大",
	empty: "这个会话还没有计划。",
} satisfies Translated<typeof EN_PLAN>;
