/**
 * THE PRACTICE AREA (简体中文): 与 en/practice.ts 一一对应。
 */

import type { Translated } from "../types.ts";
import type { practice as EN_PRACTICE } from "../en/practice.ts";

export const practice = {
	problem: "题目",
	problemDismissed: "题目已忽略。",
	concluded: "已结束",
	modelSolution: "参考答案",
	metadata: "元数据",
	mode: "模式",
	targets: "考察点",
	outcome: "结果",
	hintRung: "提示档位",
	missClass: "失误类型",
	retest: "重测",
	yourThinking: "你的思考",
	outcomeSolved: "已解出",
	outcomeSolvedWithHints: "借助提示解出",
	outcomeMovedOn: "已跳过",
	outcomeSurrendered: "已放弃",
	outcomeDismissed: "已忽略",
	valueUntagged: "未标注",
	valueNone: "无",
	valueYes: "是",
	valueNo: "否",
/* The reading-thinking field (components/reading-thinking.tsx). */
	readingThinking: "阅读中的思考",
	readingThinkingPlaceholder: "阅读时想到什么都可以写在这里。",
/* The practice dock (components/practice-dock.tsx)。 */
	problemTitle: "题目",
	dockHint: "在这里作答，边想边说。",
	/* 插件问题面板的同步状态。 */
	preparingProblem: "正在准备问题…",
	problemUnavailable: "问题不可用",
} satisfies Translated<typeof EN_PRACTICE>;
