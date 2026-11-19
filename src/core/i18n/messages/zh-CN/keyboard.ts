/**
 * THE KEYBOARD AREA (简体中文): 与 en/keyboard.ts 一一对应。
 */

import type { Translated } from "../types.ts";
import type { keyboard as EN_KEYBOARD } from "../en/keyboard.ts";

export const keyboard = {
	title: "快捷键",
	escToClose: "按 Esc 关闭",
	scopeGlobal: "全局",
	scopeChat: "对话",
	scopeAppWide: "全应用",
	scopeViews: "视图：{views}",
	toggleDictation: "切换听写",
	openSettings: "打开设置",
	modelSelector: "模型选择器",
	cycleThinkingLevel: "切换思考级别",
	toggleSessionsSidebar: "切换会话侧边栏",
	searchSessions: "搜索会话",
	graphView: "图谱视图",
	newSession: "新会话",
	renameSession: "重命名会话",
	toggleAllYourThinking: "切换全部思考内容",
	askForNudge: "提问 · 请求提示（侧边会话）",
	find: "查找",
	cheatSheet: "快捷键速查表",
	focusThinkingRows: "提问 · 焦点在思考与选项行之间切换",
	nextRow: "提问 · 下一行",
	prevRow: "提问 · 上一行",
	pickRow: "提问 · 选中行",
	submit: "提问 · 提交",
} satisfies Translated<typeof EN_KEYBOARD>;
