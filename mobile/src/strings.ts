import type { AppLocale } from "@/src/core/i18n";

/** Copy that exists only on the mobile shell. Everything shared with the
 *  desktop (sessions, settings, composer placeholders) comes from the
 *  desktop catalogs through `useT()`. */
const ZH = {
	homeTitle: "今天想学什么？",
	homeSubtitle: "从任何问题开始。教师会先探查你已经知道的部分。",
	recent: "最近的会话",
	noSessions: "还没有会话。开始第一个吧。",
	newSession: "新建会话",
	emptyChat: "发送第一条消息，开始这次学习。",
	chatPlaceholder: "提问、回答，或引导这节课…",
	demoReply:
		"（界面演示）移动端骨架已经跑通：会话、对话气泡与输入区都来自同一套主题。P2 会接入本地会话存储与真实的模型流式回复。",
	notFoundTitle: "找不到这个会话",
	notFoundDescription: "它可能已被删除，或者链接不完整。",
	backHome: "返回首页",
	language: "语言",
	languageUi: "界面语言",
	appearance: "外观",
	theme: "主题",
	dark: "深色",
	light: "浅色",
	models: "模型与密钥",
	modelsDescription: "P1 骨架暂未接入云端模型。P2 会增加 API Key 管理与模型选择。",
	about: "关于",
	version: "版本",
	platform: "运行平台",
	drawerSessions: "会话",
};

const EN: typeof ZH = {
	homeTitle: "What do you want to learn?",
	homeSubtitle: "Start anywhere. The teacher will probe what you already know.",
	recent: "Recent sessions",
	noSessions: "No sessions yet. Start the first one.",
	newSession: "New session",
	emptyChat: "Send the first message to start this lesson.",
	chatPlaceholder: "Ask, answer, or steer the lesson…",
	demoReply:
		"(UI demo) The mobile shell is running: sessions, transcript bubbles and the composer share the desktop theme. P2 connects local session storage and real streamed model replies.",
	notFoundTitle: "Session not found",
	notFoundDescription: "It may have been deleted, or the link is incomplete.",
	backHome: "Back to home",
	language: "Language",
	languageUi: "Interface language",
	appearance: "Appearance",
	theme: "Theme",
	dark: "Dark",
	light: "Light",
	models: "Models & keys",
	modelsDescription: "The P1 shell does not call cloud models yet. P2 adds API key management and model selection.",
	about: "About",
	version: "Version",
	platform: "Platform",
	drawerSessions: "Sessions",
};

export const MOBILE_STRINGS: Record<AppLocale, typeof ZH> = {
	en: EN,
	"zh-CN": ZH,
};
