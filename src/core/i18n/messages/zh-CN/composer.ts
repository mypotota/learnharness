/**
 * THE COMPOSER AREA (简体中文): 与 en/composer.ts 一一对应。
 */

import type { Translated } from "../types.ts";
import type { composer as EN_COMPOSER } from "../en/composer.ts";

export const composer = {
	placeholder: "提问、回答，或引导这节课…",
	placeholderNext: "可以问任何问题，或按 Enter 进入下一题。",
	nextProblem: "下一题",
	stop: "停止",
	send: "发送",
	nodesSelected: "已选择 {count} 个节点",
	pickNodes: "选择节点",
/* Attachment affordances (attach-files-button, file-path-drop-zone)。 */
	browserNotice: "仅桌面应用可以附加本地文件路径。你可以改为粘贴完整路径。",
	attachTitle: "附加文件或文件夹",
	attachFilesAria: "附加文件",
	folderChooseFailed: "无法选择文件夹。请重试。",
	dropToAttach: "松开以附加文件路径",
	dismissAttachmentNotice: "忽略附件提示",
	noPathsAvailable: "未获取到本地文件路径。请从电脑上拖入已有的文件或文件夹。",
	openChatToAttach: "请打开一个会话来附加文件路径。",
	someSkipped: "部分拖入的项目没有可用的文件路径。",
	/* 草稿输入框的主题占位文本（主页 + /chat/new）与听写条操作。 */
	learnPlaceholder: "你想学什么？",
	practicePlaceholder: "你想练什么？",
	startSession: "开始会话",
	dictate: "听写",
	startDictation: "开始听写",
	stopDictation: "停止听写",
	stopDictationEsc: "停止听写 (Esc)",
	dictationFailed: "听写失败：{error}",
	dictationAppendFailed: "无法应用听写记录",
	dictationLanguageUnavailable: "听写语言不可用",
	microphonePermissionDenied: "麦克风权限被拒绝",
} satisfies Translated<typeof EN_COMPOSER>;
