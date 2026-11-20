/**
 * THE SIDEBAR AREA (简体中文): 与 en/sidebar.ts 一一对应。
 */

import type { Translated } from "../types.ts";
import type { sidebar as EN_SIDEBAR } from "../en/sidebar.ts";

export const sidebar = {
	openSidebar: "打开侧边栏",
	closeSidebar: "关闭侧边栏",
	collapseSidebar: "收起侧边栏",
	home: "首页",
	sessions: "会话",
	settings: "设置",
	searchSessions: "搜索会话",
	searchPlaceholder: "搜索…",
	teaching: "教学",
	practice: "练习",
	all: "全部",
	loading: "加载中…",
	noMatch: "没有匹配的会话。",
	none: "还没有会话。",
	rename: "重命名",
	renameSession: "重命名会话",
	exportMarkdown: "导出为 Markdown…",
	delete: "删除…",
	practiceSession: "练习会话",
	newTeachingSession: "创建一个新的教学会话",
	newPracticeSession: "创建一个新的练习会话",
	timeJustNow: "刚刚",
	timeMinutes: "{count} 分钟前",
	timeHours: "{count} 小时前",
	timeDays: "{count} 天前",
	metaCompacting: "正在压缩上下文",
	metaWaiting: "等待输入",
	metaProblemWaiting: "题目待处理",
	metaWorking: "处理中…",
} satisfies Translated<typeof EN_SIDEBAR>;
