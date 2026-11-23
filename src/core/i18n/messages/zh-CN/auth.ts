/**
 * THE AUTH AREA (简体中文): 与 en/auth.ts 一一对应。
 */

import type { Translated } from "../types.ts";
import type { auth as EN_AUTH } from "../en/auth.ts";

export const auth = {
	keyDeepgram: "听写所用的语音转文字密钥 — 需要在 Deepgram 控制台拥有 ≥ Member 权限才能签发 token。",
	keyTavily: "研究者子代理的网络搜索引擎（AI 原生搜索 API）。设置密钥即启用 — 无需再切换引擎。",
	keyBrave: "研究者子代理的网络搜索引擎 — Tavily 之外的另一选择。设置密钥即启用。",
	keyExa: "面向研究者的网络搜索引擎。搜索请求会使用你的 Exa 账户及其计费。",
	keyFirecrawl: "研究者子代理的网络搜索引擎 — Tavily 和 Brave 之外的又一选择。设置密钥即启用。",
	keyOllama: "ollama.com 上的托管网络搜索 — 需要 Ollama API 密钥。设置后启用的是搜索功能，而非本地模型。",
	qwenTokenPlan: "Qwen Token 计划",
	qwenTokenPlanCn: "Qwen Token 计划（国内）",
	qwenTokenPlanIndividual: "Qwen Token 计划（个人版）",
	qwenTokenPlanIndividualCn: "Qwen Token 计划（个人版·国内）",
	xiaomiTokenPlanAms: "Xiaomi Token 计划（AMS）",
	xiaomiTokenPlanCn: "Xiaomi Token 计划（国内）",
	xiaomiTokenPlanSgp: "Xiaomi Token 计划（新加坡）",
	zaiCodingCn: "Z.AI Coding（国内）",
	customEndpoint: "自定义端点",
} satisfies Translated<typeof EN_AUTH>;
