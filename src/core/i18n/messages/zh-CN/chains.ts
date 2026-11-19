/**
 * THE CHAINS AREA (简体中文): 与 en/chains.ts 一一对应。
 */

import type { Translated } from "../types.ts";
import type { chains as EN_CHAINS } from "../en/chains.ts";

export const chains = {
	addFolder: "添加文件夹",
	searchLabel: "搜索节点",
	searchPlaceholder: "搜索节点…",
	closeChains: "关闭推理链",
	summary: "{chains, plural, other {# 条推理链}} · {nodes, plural, other {# 个节点}}",
	name: "名称",
	props: "要素",
	created: "创建时间",
	noMatch: "没有匹配的推理链。",
	notes: "笔记",
	unlabeled: "未命名",
	selectSource: "选择来源 {name}",
	selectBorn: "选择出自「{name}」的所有内容",
	expandCluster: "展开簇 {name}",
	expandSource: "展开来源 {name}",
	clear: "清除",
	delete: "删除",
	deleteSelected: "删除选中的来源和文件夹",
	done: "完成",
	donePicking: "选择完成 — 已选 {count} 个命题",
	selectionSummary: "{nodes, plural, other {# 个节点}} → {chains, plural, other {# 条推理链}}",
	sourcesSummary: "{sources, plural, other {# 个来源}}",
	foldersSuffix: "· {folders, plural, other {# 个文件夹}}",
} satisfies Translated<typeof EN_CHAINS>;
