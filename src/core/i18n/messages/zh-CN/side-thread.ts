/**
 * THE SIDE THREAD AREA (简体中文): 与 en/side-thread.ts 一一对应。
 */

import type { Translated } from "../types.ts";
import type { sideThread as EN_SIDE_THREAD } from "../en/side-thread.ts";

export const sideThread = {
	title: "侧边提问",
	ask: "提问",
	askAria: "就所选内容提出侧边提问",
	shortenSelection: "缩短所选内容",
	placeholderPassage: "针对这段内容提问…",
	placeholderFollowUp: "继续追问…",
	placeholderNew: "提出侧边提问…",
	ariaClose: "关闭侧边会话",
	dockAria: "停靠侧边会话",
	floatAria: "浮动侧边会话",
	pinTitle: "固定到侧边",
	unpinTitle: "取消固定改为浮动",
	gotoStep: "转到当前步骤",
	meterLabel: "麦克风输入电平",
	retryAnswer: "重新作答",
	showInLesson: "在课程中显示",
	showQuote: "显示引用的讲解原文",
	answering: "正在作答",
	stopped: "已停止",
} satisfies Translated<typeof EN_SIDE_THREAD>;
