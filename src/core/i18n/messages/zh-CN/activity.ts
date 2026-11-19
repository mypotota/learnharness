/**
 * THE ACTIVITY AREA (简体中文): 与 en/activity.ts 一一对应。
 */

import type { Translated } from "../types.ts";
import type { activity as EN_ACTIVITY } from "../en/activity.ts";

export const activity = {
	sectionTitle: "后台代理",
	totalCostTitle: "运行总花费（推断值）",
	labelResearcher: "研究者",
	labelDemoBuilder: "演示搭建者",
	labelFigureMaker: "图形创作者",
	labelPdfReader: "PDF 阅读者",
	labelPluginWorker: "插件工作者",
	labelSubagent: "子代理",
	extractionLabel: "抽取 — {phase}",
	abortFailed: "中止失败——请重试",
	endProcess: "结束此后台进程",
	endAria: "结束「{title}」中的{label}",
	stopping: "正在停止…",
	detailCost: "花费",
	detailContext: "上下文",
	detailModel: "模型",
	detailSteps: "步骤",
	openSession: "打开会话 →",
/* The dispatch card 的任务类别标签 (components/artifacts/dispatch-card.tsx) ——
 * 刻意采用「代理」措辞，与活动坞的角色标签不同。 */
	kindResearch: "研究代理",
	kindDemo: "演示代理",
	kindFigure: "图形代理",
	kindPdfReader: "PDF 阅读者",
	kindPluginWorker: "插件工作者",
} satisfies Translated<typeof EN_ACTIVITY>;
