/**
 * THE PLUGINS AREA (简体中文): 与 en/plugins.ts 一一对应。
 */

import type { Translated } from "../types.ts";
import type { plugins as EN_PLUGINS } from "../en/plugins.ts";

export const plugins = {
	moreActions: "更多插件操作",
	graphActions: "插件图操作",
	backToHome: "返回主页",
	loading: "正在加载插件…",
	settings: "插件设置",
	fallbackTitle: "插件",
	notInstalled: "插件未安装。",
	disabled: "该插件已停用。",
	viewUnavailable: "该插件视图不可用。",
	graphReadFailed: "无法读取知识图谱。",
} satisfies Translated<typeof EN_PLUGINS>;
