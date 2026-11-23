/**
 * THE SYNC-STATUS AREA (简体中文): 与 en/sync-status.ts 一一对应。
 */

import type { Translated } from "../types.ts";
import type { syncStatus as EN_SYNC_STATUS } from "../en/sync-status.ts";

export const syncStatus = {
	action: "立即同步",
	label: "同步状态",
	never: "未同步",
	syncing: "同步中…",
	conflict: "需处理",
	issue: "同步异常",
	unconfigured: "尚未配置同步。",
	upToDate: "已是最新。",
	pushed: "已上传到服务器。",
	pulled: "已从服务器下载，正在重新加载…",
	busyTurn: "有教学回合正在运行，请稍后再试。",
	busyJob: "有后台任务正在运行，请稍后再试。",
	failed: "同步失败：{detail}",
	openSettings: "打开同步设置",
	more: "更多",
	plan: "计划",
	coverage: "抽取覆盖率",
	phase: "阶段",
	usage: "用量",
	pluginActions: "插件动作",
	conflictTitle: "同步冲突",
	resolve: "解决冲突…",
	conflictKeepRemote: "用本机覆盖远端",
	conflictKeepLocal: "用远端覆盖本机",
	conflictLater: "暂不处理",
	conflictBackup: "本机原有数据已备份到 {path}。",
	conflictPushed: "已用本机数据覆盖远端。",
	conflictPulled: "已用远端数据覆盖本机。",
	reload: "重新加载",
} satisfies Translated<typeof EN_SYNC_STATUS>;
