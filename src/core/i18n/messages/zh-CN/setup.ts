/**
 * THE SETUP AREA (简体中文): 与 en/setup.ts 一一对应。
 */

import type { Translated } from "../types.ts";
import type { setup as EN_SETUP } from "../en/setup.ts";

export const setup = {
	title: "设置你的模型",
	intro: "选择你的 AI 服务商并粘贴其 API 密钥。接下来再挑选模型。",
	pickersIntro: "为每个档位选择模型。三档都选好才能开始对话。",
	providerAria: "服务商",
	pickProvider: "选择服务商…",
	saving: "正在保存…",
	saveKey: "保存密钥",
	saveModels: "保存模型",
	loadingModels: "正在加载模型…",
	ariaClose: "关闭设置向导",
	needed: "待选择",
	pickModel: "选择模型…",
	saveFailedOffline: "保存失败。请检查网络连接后重试。",
	saveFailedLine: "保存失败：{error}",
	rosterStrong: "探测者、老师",
	rosterCheap: "研究者、演示搭建者、抽取者、审计者",
	rosterVision: "视觉创作者 + PDF 阅读者",
	noVisionModels: "没有支持图像的模型。请添加可使用视觉模型的服务商密钥。",
	addProviderCta: "添加服务商密钥",
} satisfies Translated<typeof EN_SETUP>;
