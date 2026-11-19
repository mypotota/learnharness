/**
 * THE FIND AREA (简体中文): 与 en/find.ts 一一对应。
 */

import type { Translated } from "../types.ts";
import type { find as EN_FIND } from "../en/find.ts";

export const find = {
	barLabel: "会话内查找",
	inputLabel: "在会话中查找",
	placeholder: "在会话中查找…",
	prev: "上一个匹配",
	prevTitle: "上一个匹配（Shift+Enter）",
	next: "下一个匹配",
	nextTitle: "下一个匹配（Enter）",
	close: "关闭查找",
	closeTitle: "关闭查找（Esc）",
} satisfies Translated<typeof EN_FIND>;
