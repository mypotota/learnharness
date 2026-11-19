/**
 * THE CITATION AREA (简体中文): 与 en/citation.ts 一一对应。
 */

import type { Translated } from "../types.ts";
import type { citation as EN_CITATION } from "../en/citation.ts";

export const citation = {
	commentEditorAria: "为选中文本添加备注",
	commentEditorKeysHint: "按 Enter 保存引用备注；Command/Ctrl+Enter 保存并发送；Shift+Enter 换行。",
	commentPlaceholder: "添加可选备注…",
	commentTooLong: "备注最多可包含 8,000 个字符。",
	shortenComment: "缩短备注",
	cite: "引用",
	citeSelectionAria: "在输入中引用所选文本",
	shortenSelection: "缩短所选文本",
	goToSource: "跳转到来源",
	editCommentAria: "编辑引用备注",
	addCommentAria: "为引用添加备注",
	viewCitedAria: "查看引用的教师文本：{label}",
	quotedAria: "引用的教师文本：{label}",
	selectionActions: "选择操作",
} satisfies Translated<typeof EN_CITATION>;
