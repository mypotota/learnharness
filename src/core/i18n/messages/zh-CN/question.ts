/**
 * THE QUESTION AREA (简体中文): 与 en/question.ts 一一对应。
 */

import type { Translated } from "../types.ts";
import type { question as EN_QUESTION } from "../en/question.ts";

export const question = {
	answer: "作答",
	open: "打开",
	checkUnderstanding: "检验一下你的理解",
	kindCheck: "检查",
	kindProbe: "探测",
	kindRecall: "回忆",
	kindExplain: "解释",
	kindQuestion: "提问",
	selectAllThatApply: " · 可多选",
	kindPredict: "预测",
	verdictCorrect: "正确",
	verdictIncorrect: "错误",
	verdictDontKnow: "不知道",
	answeredDontKnow: "已用「我不知道」作答。",
	skipped: "— 已跳过",
	why: "为什么",
	hideWhy: "收起理由",
	whyLabel: "理由：",
	answerLabel: "答案：",
	dontKnow: "我不知道",
	confidence: "把握",
	confidenceAria: "把握 — 你所选答案正确的概率",
	confidenceHint: "你所选答案正确的概率 — 50% 相当于抛硬币。用 ←/→ 调整。",
	confidencePercent: "{value}%",
	typeAnswer: "输入你的答案…",
	typeOwnAnswer: "输入你自己的答案…",
	thinkingPlaceholder: "为什么选这个答案？想到什么就写什么。",
	compactingSession: "正在压缩会话…",
	submitHint: "↵ 提交 · ⇧↵ 换行",
	submitAnswer: "提交答案",
	pluginPreparing: "正在准备问题…",
	pluginUnavailable: "问题不可用",
	pluginDismiss: "忽略问题",
	pluginYourThinking: "你的思考",
/* Malformed-question recovery (components/malformed-question.tsx). */
	undisplayable: "该问题无法显示。",
	retryQuestion: "重试该问题",
	retryHint: "可重试该问题，或发送一条消息继续。",
	retryTitleFallback: "向模型请求替换的问题。",
/* The learner's submitted images (components/submitted-images.tsx). */
	submittedImage: "提交的图像",
	openSubmittedFullscreen: "全屏打开提交的图像",
	dismissed: "问题已忽略",
} satisfies Translated<typeof EN_QUESTION>;
