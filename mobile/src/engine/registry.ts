/**
 * Mobile model registry — the same pi-ai catalogs the desktop runs on.
 *
 * Every provider the desktop exposes through a plain API key is registered
 * here, plus the one custom OpenAI-compatible endpoint. Keys never live in
 * JS memory for long: pi-ai's injected AuthContext resolves each request's
 * key from the Android Keystore store.
 */

import {
	createModels,
	createProvider,
	getSupportedThinkingLevels,
	normalizeContext,
	type Api,
	type Message,
	type Model,
	type ModelThinkingLevel,
	type Models,
	type MutableModels,
	type Provider,
	type Usage,
} from "@earendil-works/pi-ai";
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";
import { AUTH_PROVIDER_KEYS, CUSTOM_PROVIDER, genericProviderKeyGuard } from "@/src/core/auth-keys.ts";
import { DEFAULT_THINKING_ORDER } from "@/src/core/settings.ts";
import { SecureStore } from "../native/secure-store";

import { antLingProvider } from "@earendil-works/pi-ai/providers/ant-ling";
import { anthropicProvider } from "@earendil-works/pi-ai/providers/anthropic";
import { basetenProvider } from "@earendil-works/pi-ai/providers/baseten";
import { cerebrasProvider } from "@earendil-works/pi-ai/providers/cerebras";
import { deepseekProvider } from "@earendil-works/pi-ai/providers/deepseek";
import { fireworksProvider } from "@earendil-works/pi-ai/providers/fireworks";
import { googleProvider } from "@earendil-works/pi-ai/providers/google";
import { groqProvider } from "@earendil-works/pi-ai/providers/groq";
import { huggingfaceProvider } from "@earendil-works/pi-ai/providers/huggingface";
import { kimiCodingProvider } from "@earendil-works/pi-ai/providers/kimi-coding";
import { metaProvider } from "@earendil-works/pi-ai/providers/meta";
import { minimaxProvider } from "@earendil-works/pi-ai/providers/minimax";
import { minimaxCnProvider } from "@earendil-works/pi-ai/providers/minimax-cn";
import { mistralProvider } from "@earendil-works/pi-ai/providers/mistral";
import { moonshotaiProvider } from "@earendil-works/pi-ai/providers/moonshotai";
import { moonshotaiCnProvider } from "@earendil-works/pi-ai/providers/moonshotai-cn";
import { nvidiaProvider } from "@earendil-works/pi-ai/providers/nvidia";
import { openaiProvider } from "@earendil-works/pi-ai/providers/openai";
import { opencodeProvider } from "@earendil-works/pi-ai/providers/opencode";
import { opencodeGoProvider } from "@earendil-works/pi-ai/providers/opencode-go";
import { openrouterProvider } from "@earendil-works/pi-ai/providers/openrouter";
import { qwenTokenPlanProvider } from "@earendil-works/pi-ai/providers/qwen-token-plan";
import { qwenTokenPlanCnProvider } from "@earendil-works/pi-ai/providers/qwen-token-plan-cn";
import { qwenTokenPlanIndividualProvider } from "@earendil-works/pi-ai/providers/qwen-token-plan-individual";
import { radiusProvider } from "@earendil-works/pi-ai/providers/radius";
import { togetherProvider } from "@earendil-works/pi-ai/providers/together";
import { typesafeProvider } from "@earendil-works/pi-ai/providers/typesafe";
import { vercelAIGatewayProvider } from "@earendil-works/pi-ai/providers/vercel-ai-gateway";
import { xaiProvider } from "@earendil-works/pi-ai/providers/xai";
import { xiaomiProvider } from "@earendil-works/pi-ai/providers/xiaomi";
import { xiaomiTokenPlanAmsProvider } from "@earendil-works/pi-ai/providers/xiaomi-token-plan-ams";
import { xiaomiTokenPlanCnProvider } from "@earendil-works/pi-ai/providers/xiaomi-token-plan-cn";
import { xiaomiTokenPlanSgpProvider } from "@earendil-works/pi-ai/providers/xiaomi-token-plan-sgp";
import { zaiProvider } from "@earendil-works/pi-ai/providers/zai";
import { zaiCodingCnProvider } from "@earendil-works/pi-ai/providers/zai-coding-cn";

const PROVIDER_FACTORIES: Record<string, () => Provider> = {
	"ant-ling": antLingProvider,
	anthropic: anthropicProvider,
	baseten: basetenProvider,
	cerebras: cerebrasProvider,
	deepseek: deepseekProvider,
	fireworks: fireworksProvider,
	google: googleProvider,
	groq: groqProvider,
	huggingface: huggingfaceProvider,
	"kimi-coding": kimiCodingProvider,
	meta: metaProvider,
	minimax: minimaxProvider,
	"minimax-cn": minimaxCnProvider,
	mistral: mistralProvider,
	moonshotai: moonshotaiProvider,
	"moonshotai-cn": moonshotaiCnProvider,
	nvidia: nvidiaProvider,
	openai: openaiProvider,
	opencode: opencodeProvider,
	"opencode-go": opencodeGoProvider,
	openrouter: openrouterProvider,
	"qwen-token-plan": qwenTokenPlanProvider,
	"qwen-token-plan-cn": qwenTokenPlanCnProvider,
	"qwen-token-plan-individual": qwenTokenPlanIndividualProvider,
	radius: radiusProvider,
	together: togetherProvider,
	typesafe: typesafeProvider,
	"vercel-ai-gateway": vercelAIGatewayProvider,
	xai: xaiProvider,
	xiaomi: xiaomiProvider,
	"xiaomi-token-plan-ams": xiaomiTokenPlanAmsProvider,
	"xiaomi-token-plan-cn": xiaomiTokenPlanCnProvider,
	"xiaomi-token-plan-sgp": xiaomiTokenPlanSgpProvider,
	zai: zaiProvider,
	"zai-coding-cn": zaiCodingCnProvider,
};

const CUSTOM_CONFIG_KEY = "lh:mobile:custom-provider:v1";
const SELECTION_KEY = "lh:mobile:model:v1";
const KEYLESS_PLACEHOLDER = "not-needed";
const CUSTOM_DEFAULT_CONTEXT = 8192;
const CUSTOM_DEFAULT_MAX_TOKENS = 4096;

export interface CustomProviderConfig {
	baseUrl: string;
	modelIds: string[];
	contextWindow?: number;
	maxTokens?: number;
}

export interface ProviderRow {
	id: string;
	label: string;
	envVar: string;
	present: boolean;
	modelCount: number;
	custom?: boolean;
}

export interface CatalogModel {
	provider: string;
	id: string;
	name: string;
	contextWindow: number | null;
	maxTokens: number | null;
	image: boolean;
	reasoning: boolean;
	supportedLevels: ModelThinkingLevel[];
}

export interface ModelRef {
	provider: string;
	id: string;
	thinkingLevel?: ModelThinkingLevel;
}

const listeners = new Set<() => void>();
let version = 0;
let models: MutableModels | null = null;
let initialization: Promise<void> | null = null;
let keys = new Set<string>();
let customConfig: CustomProviderConfig | null = readCustomConfig();
let selection: ModelRef | null = readSelection();
let catalogCache: CatalogModel[] | null = null;

function bump(): void {
	version++;
	catalogCache = null;
	for (const listener of listeners) listener();
}

export function subscribeModels(listener: () => void): () => void {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

export function modelsVersion(): number {
	return version;
}

function readCustomConfig(): CustomProviderConfig | null {
	try {
		const raw = localStorage.getItem(CUSTOM_CONFIG_KEY);
		if (!raw) return null;
		const parsed = JSON.parse(raw) as Partial<CustomProviderConfig>;
		const baseUrl = normalizeBaseUrl(parsed.baseUrl ?? "");
		const modelIds = Array.isArray(parsed.modelIds) ? parsed.modelIds.filter((id) => typeof id === "string" && id.trim()) : [];
		if (!baseUrl || modelIds.length === 0) return null;
		return {
			baseUrl,
			modelIds: modelIds.map((id) => id.trim()),
			contextWindow: typeof parsed.contextWindow === "number" ? parsed.contextWindow : undefined,
			maxTokens: typeof parsed.maxTokens === "number" ? parsed.maxTokens : undefined,
		};
	} catch {
		return null;
	}
}

function readSelection(): ModelRef | null {
	try {
		const raw = localStorage.getItem(SELECTION_KEY);
		if (!raw) return null;
		const parsed = JSON.parse(raw) as Partial<ModelRef>;
		if (!parsed.provider || !parsed.id) return null;
		return parsed as ModelRef;
	} catch {
		return null;
	}
}

export function normalizeBaseUrl(raw: string): string | null {
	const value = raw.trim().replace(/\/+$/, "");
	if (!value) return null;
	try {
		const url = new URL(value);
		if (url.protocol !== "https:" && url.protocol !== "http:") return null;
		return value;
	} catch {
		return null;
	}
}

/** Boot: load key names, build the collection, register every provider. */
export async function initModelRegistry(): Promise<void> {
	if (models) return;
	initialization ??= (async () => {
		const names = await SecureStore.keys();
		keys = new Set(names);
		const collection = createModels({
			authContext: {
				env: async (name) => (await SecureStore.get(name)) ?? undefined,
				fileExists: async () => false,
			},
		});
		for (const [id, factory] of Object.entries(PROVIDER_FACTORIES)) {
			try {
				collection.setProvider(factory());
			} catch {
				// A provider that cannot construct (browser-incompatible auth
				// machinery) is simply absent; the picker never shows it.
			}
		}
		models = collection;
		await syncCustomProvider();
		bump();
	})().finally(() => {
		initialization = null;
	});
	await initialization;
}

function engine(): Models {
	if (!models) throw new Error("model registry is not ready");
	return models;
}

function customProvider(): Provider | null {
	const config = customConfig;
	if (!config) return null;
	const authEnvVar = CUSTOM_PROVIDER.envVar;
	return createProvider({
		id: CUSTOM_PROVIDER.id,
		name: CUSTOM_PROVIDER.label,
		baseUrl: config.baseUrl,
		auth: {
			apiKey: {
				name: `${CUSTOM_PROVIDER.label} API key`,
				resolve: async () => {
					const key = await SecureStore.get(authEnvVar);
					return { auth: { apiKey: key ?? KEYLESS_PLACEHOLDER }, source: key ? authEnvVar : "keyless" };
				},
			},
		},
		models: config.modelIds.map((id) => ({
			id,
			name: id,
			api: "openai-completions" as const,
			provider: CUSTOM_PROVIDER.id,
			baseUrl: config.baseUrl,
			reasoning: true,
			input: ["text", "image"] as ("text" | "image")[],
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
			contextWindow: config.contextWindow ?? CUSTOM_DEFAULT_CONTEXT,
			maxTokens: config.maxTokens ?? CUSTOM_DEFAULT_MAX_TOKENS,
			type: "chat" as const,
		})),
		api: openAICompletionsApi(),
	});
}

async function syncCustomProvider(): Promise<void> {
	if (!models) return;
	const provider = customProvider();
	if (provider) models.setProvider(provider);
	else models.deleteProvider(CUSTOM_PROVIDER.id);
}

/** Every provider the desktop's key table exposes, plus the custom endpoint. */
export function providerRows(): ProviderRow[] {
	const rows: ProviderRow[] = AUTH_PROVIDER_KEYS.map((entry) => ({
		id: entry.id,
		label: entry.label,
		envVar: entry.envVar,
		present: keys.has(entry.envVar),
		modelCount: models ? models.getModels(entry.id).length : 0,
	}));
	rows.push({
		id: CUSTOM_PROVIDER.id,
		label: CUSTOM_PROVIDER.label,
		envVar: CUSTOM_PROVIDER.envVar,
		present: customConfig !== null,
		modelCount: models ? models.getModels(CUSTOM_PROVIDER.id).length : 0,
		custom: true,
	});
	return rows;
}

export function providerLabel(provider: string): string {
	if (provider === CUSTOM_PROVIDER.id) return CUSTOM_PROVIDER.label;
	return AUTH_PROVIDER_KEYS.find((entry) => entry.id === provider)?.label ?? provider;
}

export function keyPresent(envVar: string): boolean {
	return keys.has(envVar);
}

export async function setProviderKey(
	envVar: string,
	value: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
	const guard = genericProviderKeyGuard(envVar, value);
	if (!guard.ok) return guard;
	await SecureStore.set(envVar, value.trim());
	keys.add(envVar);
	bump();
	return { ok: true };
}

export async function removeProviderKey(envVar: string): Promise<void> {
	await SecureStore.remove(envVar);
	keys.delete(envVar);
	bump();
}

export async function saveCustomConfig(
	config: CustomProviderConfig,
	key?: string | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
	const baseUrl = normalizeBaseUrl(config.baseUrl);
	if (!baseUrl) return { ok: false, error: "Base URL must be a valid http(s) URL" };
	const modelIds = [...new Set(config.modelIds.map((id) => id.trim()).filter(Boolean))];
	if (modelIds.length === 0) return { ok: false, error: "Add at least one model id" };
	if (key) {
		const guard = genericProviderKeyGuard(CUSTOM_PROVIDER.envVar, key);
		if (!guard.ok) return guard;
		await SecureStore.set(CUSTOM_PROVIDER.envVar, key.trim());
		keys.add(CUSTOM_PROVIDER.envVar);
	}
	customConfig = { ...config, baseUrl, modelIds };
	try {
		localStorage.setItem(CUSTOM_CONFIG_KEY, JSON.stringify(customConfig));
	} catch {
		/* the in-memory config still serves this run */
	}
	await syncCustomProvider();
	bump();
	return { ok: true };
}

export async function clearCustomConfig(): Promise<void> {
	customConfig = null;
	try {
		localStorage.removeItem(CUSTOM_CONFIG_KEY);
	} catch {
		/* nothing to clean up */
	}
	if (models) models.deleteProvider(CUSTOM_PROVIDER.id);
	bump();
}

export function customConfigValue(): CustomProviderConfig | null {
	return customConfig;
}

export async function discoverCustomModels(
	baseUrl: string,
	apiKey?: string | null,
): Promise<{ ok: true; models: string[] } | { ok: false; error: string }> {
	const base = normalizeBaseUrl(baseUrl);
	if (!base) return { ok: false, error: "Base URL must be a valid http(s) URL" };
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), 15_000);
	try {
		const response = await fetch(`${base}/models`, {
			headers: apiKey ? { authorization: `Bearer ${apiKey.trim()}` } : {},
			signal: controller.signal,
		});
		if (!response.ok) return { ok: false, error: `Endpoint returned HTTP ${response.status}` };
		const body = (await response.json()) as unknown;
		const list = Array.isArray(body)
			? body
			: typeof body === "object" && body !== null && Array.isArray((body as { data?: unknown }).data)
				? (body as { data: unknown[] }).data
				: typeof body === "object" && body !== null && Array.isArray((body as { models?: unknown }).models)
					? (body as { models: unknown[] }).models
					: null;
		if (!list) return { ok: false, error: "Endpoint response was not a model list" };
		const ids = list
			.map((entry) => (typeof entry === "string" ? entry : typeof entry === "object" && entry !== null ? (entry as { id?: unknown }).id : undefined))
			.filter((id): id is string => typeof id === "string" && id.length > 0);
		if (ids.length === 0) return { ok: false, error: "Endpoint returned no model ids" };
		return { ok: true, models: [...new Set(ids)].sort() };
	} catch (error) {
		return {
			ok: false,
			error: controller.signal.aborted ? "Endpoint timed out" : error instanceof Error ? error.message : "Discovery request failed",
		};
	} finally {
		clearTimeout(timer);
	}
}

/** The picker's rows: every model of every configured provider. */
export function catalog(): CatalogModel[] {
	if (catalogCache) return catalogCache;
	if (!models) return [];
	const rows: CatalogModel[] = [];
	for (const row of providerRows()) {
		if (!row.present) continue;
		for (const model of models.getModels(row.id)) {
			rows.push({
				provider: model.provider,
				id: model.id,
				name: model.name,
				contextWindow: model.contextWindow ?? null,
				maxTokens: model.maxTokens ?? null,
				image: model.input.includes("image"),
				reasoning: model.reasoning,
				supportedLevels: getSupportedThinkingLevels(model),
			});
		}
	}
	catalogCache = rows.sort((a, b) => a.provider.localeCompare(b.provider) || a.name.localeCompare(b.name));
	return catalogCache;
}

export function findModel(ref: ModelRef): Model<Api> | undefined {
	if (!models) return undefined;
	return models.getModel(ref.provider, ref.id);
}

export function selectedModel(): ModelRef | null {
	return selection;
}

export function setSelectedModel(ref: ModelRef | null): void {
	selection = ref;
	try {
		if (ref) localStorage.setItem(SELECTION_KEY, JSON.stringify(ref));
		else localStorage.removeItem(SELECTION_KEY);
	} catch {
		/* in-memory selection still applies */
	}
	bump();
}

export function defaultThinkingLevel(model: Model<Api>): ModelThinkingLevel {
	const supported = getSupportedThinkingLevels(model);
	for (const level of DEFAULT_THINKING_ORDER) {
		if (supported.includes(level)) return level;
	}
	return supported[0] ?? "off";
}

export interface StreamHandlers {
	onText?: (text: string) => void;
	onThinking?: (text: string) => void;
	onDone?: (text: string, usage: Usage, stopReason: string) => void;
}

export interface ChatTurn {
	role: "user" | "assistant";
	text: string;
}

const EMPTY_USAGE: Usage = {
	input: 0,
	output: 0,
	cacheRead: 0,
	cacheWrite: 0,
	totalTokens: 0,
	cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

/** One streamed reply over the session's transcript. Throws honestly when
 *  the chosen model/provider is not configured. */
export async function streamReply(
	ref: ModelRef,
	systemPrompt: string,
	history: ChatTurn[],
	signal: AbortSignal,
	handlers: StreamHandlers = {},
): Promise<{ text: string; usage: Usage; stopReason: string }> {
	const model = findModel(ref);
	if (!model) throw new Error("The selected model is unavailable — pick one in Settings.");
	const level = ref.thinkingLevel ?? defaultThinkingLevel(model);
	const messages: Message[] = history.map((turn) =>
		turn.role === "user"
			? { role: "user" as const, content: [{ type: "text" as const, text: turn.text }], timestamp: Date.now() }
			: {
					role: "assistant" as const,
					content: [{ type: "text" as const, text: turn.text }],
					api: model.api,
					provider: model.provider,
					model: model.id,
					usage: EMPTY_USAGE,
					stopReason: "stop" as const,
					timestamp: Date.now(),
				},
	);
	const stream = engine().streamSimple(model, normalizeContext({ systemPrompt, messages }), {
		reasoning: level === "off" ? undefined : level,
		signal,
	});
	let text = "";
	let thinking = "";
	let usage: Usage = EMPTY_USAGE;
	let stopReason = "stop";
	for await (const event of stream) {
		switch (event.type) {
			case "text_delta":
				text += event.delta;
				handlers.onText?.(text);
				break;
			case "thinking_delta":
				thinking += event.delta;
				handlers.onThinking?.(thinking);
				break;
			case "done":
				if (event.message.usage) usage = event.message.usage;
				stopReason = event.reason;
				break;
			case "error":
				throw new Error(event.error.errorMessage || `The provider stopped with "${event.reason}".`);
			default:
				break;
		}
	}
	handlers.onDone?.(text, usage, stopReason);
	return { text, usage, stopReason };
}
