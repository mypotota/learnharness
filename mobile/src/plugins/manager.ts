/**
 * The mobile plugin frontend host.
 *
 * Activates enabled plugins' browser bundles, keeps their registrations
 * (views, actions, settings, renderers), and exposes a snapshot to React.
 * Plugins run inside the same WebView as the app; their backend work happens
 * in the embedded Node runtime through `call`.
 */

import { useSyncExternalStore } from "react";
import type {
	PluginAction,
	PluginActionPlacement,
	PluginCodeBlockRenderer,
	PluginFrontendContext,
	PluginFrontendModule,
	PluginInfo,
	PluginNotification,
	PluginSettingsRegistration,
	PluginSubmissionInterceptor,
	PluginToolRenderer,
	PluginView,
} from "@/src/core/plugins.ts";
import type { PluginQuestionRenderer } from "@/src/core/plugin-questions.ts";
import type { PluginProblemRenderer } from "@/src/core/plugin-problems.ts";
import type { ServerEvent } from "@/src/core/events.ts";
import type { PluginSettingsSchema } from "@/src/core/plugin-ui.ts";
import { callPlugin, listPlugins, refreshPlugins, setPluginEnabled } from "./api";
import { createUi } from "./ui";
import { readBootLocale } from "../platform/i18n-provider";
import { navigate } from "../platform/next-navigation";

export interface PluginActivation {
	info: PluginInfo;
	signal: AbortSignal;
	error?: string;
	views: Map<string, PluginView>;
	actions: Map<string, PluginAction>;
	placements: PluginActionPlacement[];
	settings?: PluginSettingsRegistration;
	codeBlocks: Map<string, PluginCodeBlockRenderer>;
	toolRenderers: Map<string, PluginToolRenderer>;
	questionRenderers: PluginQuestionRenderer[];
	problemRenderers: PluginProblemRenderer[];
	interceptors: PluginSubmissionInterceptor[];
}

export interface PluginSnapshot {
	infos: PluginInfo[];
	activations: Map<string, PluginActivation>;
	version: number;
}

const listeners = new Set<() => void>();
let infos: PluginInfo[] = [];
let activations = new Map<string, PluginActivation>();
let version = 0;
let initializing: Promise<void> | null = null;

function publish() {
	version += 1;
	for (const listener of listeners) listener();
}

export function subscribePlugins(listener: () => void): () => void {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

export function pluginSnapshot(): PluginSnapshot {
	return { infos, activations, version };
}

export function usePlugins(): PluginSnapshot {
	return useSyncExternalStore(subscribePlugins, pluginSnapshot, pluginSnapshot);
}

/** Enabled plugins that loaded successfully, in list order. */
export function activePlugins(): PluginActivation[] {
	return infos
		.filter((info) => info.enabled && info.manifest?.main)
		.map((info) => activations.get(info.id))
		.filter((activation): activation is PluginActivation => Boolean(activation) && !activation?.error);
}

function validateId(id: unknown, label: string): string {
	if (typeof id !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) throw new Error(`Invalid ${label}: ${String(id)}`);
	return id;
}

function stylesheet(info: PluginInfo): HTMLLinkElement | null {
	if (!info.manifest?.main || !info.manifest.styles) return null;
	const link = document.createElement("link");
	link.rel = "stylesheet";
	link.dataset.plugin = info.id;
	link.href = pluginStylesheetUrl(info);
	document.head.appendChild(link);
	return link;
}

let assetOrigin: ((id: string, path: string) => string) | null = null;
export function setPluginAssetResolver(resolver: (id: string, path: string) => string) {
	assetOrigin = resolver;
}

function pluginModuleUrl(info: PluginInfo): string {
	const main = info.manifest?.main;
	if (!main) throw new Error("Plugin has no frontend entry");
	if (!assetOrigin) throw new Error("Plugin asset resolver is not ready");
	return `${assetOrigin(info.id, main)}?v=${encodeURIComponent(info.revision)}`;
}

function pluginStylesheetUrl(info: PluginInfo): string {
	if (!assetOrigin || !info.manifest?.styles) throw new Error("Plugin asset resolver is not ready");
	return assetOrigin(info.id, info.manifest.styles);
}

function createContext(info: PluginInfo): { context: PluginFrontendContext; activation: PluginActivation } {
	const controller = new AbortController();
	const activation: PluginActivation = {
		info,
		signal: controller.signal,
		views: new Map(),
		actions: new Map(),
		placements: [],
		codeBlocks: new Map(),
		toolRenderers: new Map(),
		questionRenderers: [],
		problemRenderers: [],
		interceptors: [],
	};
	const signal = controller.signal;
	const locale = readBootLocale();
	const assertLive = () => {
		if (signal.aborted) throw new Error("Plugin activation has ended");
	};
	const registerMap = <T>(map: Map<string, T>, id: string, value: T, label: string): (() => void) => {
		assertLive();
		if (map.has(id)) throw new Error(`Duplicate ${label}: ${id}`);
		map.set(id, value);
		return () => map.delete(id);
	};
	const cleanup: Array<() => void | Promise<void>> = [];
	const context: PluginFrontendContext = {
		manifest: info.manifest!,
		locale,
		signal,
		cleanup: (dispose) => {
			cleanup.push(dispose);
		},
		registerView: (view) => registerMap(activation.views, validateId(view.id, "view id"), view, "view"),
		registerAction: (action) => registerMap(activation.actions, validateId(action.id, "action id"), action, "action"),
		placeAction: (placement) => {
			assertLive();
			if (activation.placements.some((item) => item.id === placement.id)) throw new Error(`Duplicate placement: ${placement.id}`);
			activation.placements.push(placement);
			return () => {
				activation.placements = activation.placements.filter((item) => item.id !== placement.id);
			};
		},
		refreshActions: () => publish(),
		registerSubmissionInterceptor: (definition) => {
			assertLive();
			if (activation.interceptors.some((item) => item.id === definition.id)) throw new Error(`Duplicate submission interceptor: ${definition.id}`);
			activation.interceptors.push(definition);
			return () => {
				activation.interceptors = activation.interceptors.filter((item) => item.id !== definition.id);
			};
		},
		refreshSubmissions: () => publish(),
		registerSettings: ((settings: PluginSettingsRegistration) => {
			assertLive();
			if (activation.settings) throw new Error("Only one settings registration is allowed");
			activation.settings = settings;
			if (typeof settings === "function") {
				return () => {
					activation.settings = undefined;
				};
			}
			return {
				update: (next: Partial<PluginSettingsSchema>) => {
					activation.settings = { ...(activation.settings as PluginSettingsSchema), ...next };
					publish();
				},
				dispose: () => {
					activation.settings = undefined;
				},
			};
		}) as PluginFrontendContext["registerSettings"],
		ui: createUi(signal),
		registerCodeBlock: (renderer) => registerMap(activation.codeBlocks, renderer.language, renderer, "code block language"),
		registerToolRenderer: (renderer) => registerMap(activation.toolRenderers, renderer.toolName, renderer, "tool renderer"),
		registerQuestionRenderer: (renderer) => {
			assertLive();
			if (activation.questionRenderers.some((item) => item.id === renderer.id)) throw new Error(`Duplicate question renderer: ${renderer.id}`);
			activation.questionRenderers.push(renderer);
			return () => {
				activation.questionRenderers = activation.questionRenderers.filter((item) => item.id !== renderer.id);
			};
		},
		registerProblemRenderer: (renderer) => {
			assertLive();
			if (activation.problemRenderers.some((item) => item.id === renderer.id)) throw new Error(`Duplicate problem renderer: ${renderer.id}`);
			activation.problemRenderers.push(renderer);
			return () => {
				activation.problemRenderers = activation.problemRenderers.filter((item) => item.id !== renderer.id);
			};
		},
		call: async <T = unknown>(operation: string, input?: unknown): Promise<T> => {
			assertLive();
			const { result } = await callPlugin<T>(info.id, operation, input);
			return result;
		},
		documents: {
			toMarkdown: async (file, options) => {
				assertLive();
				if (options?.signal?.aborted) throw new Error("Cancelled");
				const name = file.name;
				if (/\.pdf$/i.test(name) || file.type === "application/pdf") {
					throw new Error("PDF 转换在移动端暂不可用");
				}
				if (file.size > 8 * 1024 * 1024) throw new Error("文件过大（上限 8MB）");
				const text = await file.text();
				if (!text.trim()) throw new Error("文件为空");
				return { name, markdown: text, notices: [] };
			},
		},
		onNotification: () => () => {},
		onAppEvent: (_listener: (event: ServerEvent) => void) => () => {},
		onResync: () => () => {},
		app: {
			pathname: () => window.location.pathname,
			openSession: (id: string) => navigate(`/chat/${encodeURIComponent(id)}`),
			openHome: () => navigate("/"),
			openView: (id: string) => navigate(`/plugins/${info.id}/${encodeURIComponent(validateId(id, "view id"))}`),
			openSettings: () => navigate(`/plugins/${info.id}`),
		},
	};
	return { context, activation };
}

async function activate(info: PluginInfo): Promise<void> {
	if (!info.manifest?.main || info.status === "error") return;
	if (activations.get(info.id)?.info.revision === info.revision) return;
	await deactivate(info.id);
	const { context, activation } = createContext(info);
	const style = stylesheet(info);
	try {
		if (!assetOrigin) throw new Error("Plugin assets are not available");
		const module = (await import(/* @vite-ignore */ pluginModuleUrl(info))) as PluginFrontendModule;
		if (typeof module.activate !== "function") throw new Error("Plugin frontend must export activate(context)");
		const cleanup = await module.activate(context);
		if (typeof cleanup === "function") context.cleanup(cleanup);
		activations.set(info.id, activation);
	} catch (error) {
		activation.error = error instanceof Error ? error.message : String(error);
		activations.set(info.id, activation);
		style?.remove();
		console.warn(`[plugins] ${info.id} failed to activate`, error);
	}
	publish();
}

async function deactivate(id: string): Promise<void> {
	const activation = activations.get(id);
	if (!activation) return;
	activations.delete(id);
	activation.signal.abort();
	document.querySelectorAll(`link[data-plugin="${id}"]`).forEach((node) => node.remove());
	for (const cleanup of [...activation.interceptors].reverse()) {
		if (typeof (cleanup as { dispose?: () => void }).dispose === "function") (cleanup as { dispose: () => void }).dispose();
	}
	activation.views.clear();
	activation.actions.clear();
	activation.placements = [];
	activation.settings = undefined;
	activation.codeBlocks.clear();
	activation.toolRenderers.clear();
	activation.questionRenderers = [];
	activation.problemRenderers = [];
	activation.interceptors = [];
	publish();
}

/** Load the list and activate enabled frontends; safe to call repeatedly. */
export function ensurePlugins(): Promise<void> {
	initializing ??= (async () => {
		const { plugins } = await listPlugins();
		infos = plugins;
		for (const info of infos) {
			if (info.enabled) await activate(info);
		}
		publish();
	})().catch((error) => {
		initializing = null;
		throw error;
	});
	return initializing;
}

export async function refreshPluginList(): Promise<void> {
	const { plugins } = await refreshPlugins();
	infos = plugins;
	for (const info of infos) {
		if (info.enabled) await activate(info);
		else await deactivate(info.id);
	}
	publish();
}

export async function togglePlugin(id: string, enabled: boolean): Promise<void> {
	const { plugin } = await setPluginEnabled(id, enabled);
	infos = infos.map((info) => (info.id === id ? plugin : info));
	if (enabled) await activate(plugin);
	else await deactivate(id);
	publish();
}

export function findView(pluginId: string, viewId: string): PluginView | undefined {
	return activations.get(pluginId)?.views.get(viewId);
}

export function findAction(pluginId: string, actionId: string): PluginAction | undefined {
	return activations.get(pluginId)?.actions.get(actionId);
}

export function notificationHints(pluginId: string): PluginNotification[] {
	void pluginId;
	return [];
}
