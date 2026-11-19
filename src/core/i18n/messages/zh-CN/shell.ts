/**
 * THE SHELL AREA (简体中文): 与 en/shell.ts 一一对应。
 */

import type { Translated } from "../types.ts";
import type { shell as EN_SHELL } from "../en/shell.ts";

export const shell = {
	updateReady: "LearnHarness {version} 已就绪",
	updateRestartNote: " —— 重启以完成安装。",
	updateDismissAria: "忽略更新通知",
} satisfies Translated<typeof EN_SHELL>;
