/**
 * THE COMMON AREA (简体中文): 与 en/common.ts 一一对应。
 *
 * `satisfies Translated<...>` 让漏翻与多翻都变成编译错误——两个目录永远
 * 对齐，不需要靠人肉检查。
 */

import type { Translated } from "../types.ts";
import type { common as EN_COMMON } from "../en/common.ts";

export const common = {
	cancel: "取消",
	confirm: "确认",
	close: "关闭",
	save: "保存",
	saved: "已保存",
	delete: "删除",
	rename: "重命名",
	copy: "复制",
	copied: "已复制",
	loading: "加载中…",
	retry: "重试",
	error: "错误",
	search: "搜索",
	settings: "设置",
	more: "更多",
	back: "返回",
	done: "完成",
	apply: "应用",
	reset: "重置",
	clear: "清除",
	dismiss: "忽略",
	optional: "可选",
	none: "无",
	all: "全部",
	unknown: "未知",
	closeDialog: "关闭对话框",
} satisfies Translated<typeof EN_COMMON>;
