/**
 * THE CHAT AREA (简体中文): 与 en/chat.ts 一一对应。
 */

import type { Translated } from "../types.ts";
import type { chat as EN_CHAT } from "../en/chat.ts";

export const chat = {
	compacting: "正在压缩上下文",
	compactingLabel: "正在压缩上下文…",
	somethingWentWrong: "出错了：{message}",
	retry: "重试",
	setupModels: "设置模型",
	newSession: "新会话",
	emptyDescription: "老师会先通过提问了解你已经掌握的内容。",
	newPracticeSession: "新练习会话",
	practiceEmptyDescription: "从知识图谱中选取节点，描述你想练习的内容，或自带题目。",
	openingFailure: "无法打开会话。你的消息仍在这里，请再次发送。",
	malformedPendingReason: "请先回答或放弃当前的问题。",
	renameSession: "重命名会话",
	renameThisSession: "重命名此会话",
	sessionTitle: "会话标题",
	openFullPlan: "打开完整计划",
	plan: "计划",
	practice: "练习",
	nextProblem: "下一题",
	retrying: "正在重试…",
	syncFailed: "无法同步已保存的会话。",
	retrySyncing: "重新同步",
	preparingQuestion: "正在准备题目…",
	questionUnavailable: "题目不可用",
	dismissQuestion: "忽略题目",
/* The Esc abort guard (components/abort-turn-dialog.tsx). */
	abortTurnTitle: "要中止这一轮吗？",
	abortTurnLine: "已生成的部分回答会保留在会话记录中。",
	abortAction: "中止",
	dismissQuestionTitle: "要忽略这个问题吗？",
	dismissQuestionLine: "已跳过 —— 教师将继续后面的内容。",
	dismissAction: "忽略",
	discardProblemTitle: "要放弃这道练习题吗？",
	discardProblemLine: "这道题将被丢弃 —— 不会展示解答。",
	discardAction: "放弃",
	busyStopsToo: "正在进行的一轮也会停止。",
/* Transcript dividers + thinking rows (compaction-divider, ai-elements). */
	contextCompacted: "上下文已压缩",
	historyCompacted: "历史已压缩",
	agentThinking: "代理的思考",
	thinking: "思考中",
	thinkingStreaming: "思考中…",
/* Branch navigation (ai-elements/message.tsx). */
	nextBranch: "下一分支",
	previousBranch: "上一分支",
} satisfies Translated<typeof EN_CHAT>;
