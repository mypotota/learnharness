/**
 * The plugin host HTTP client.
 *
 * Every call lands in the embedded Node runtime; the port is discovered from
 * its health probe so a shifted port never strands the UI.
 */

import type { PluginInfo } from "@/src/core/plugins.ts";
import { nodeAssetUrl, nodeFetch } from "../platform/node-runtime";

async function request<T>(path: string, body?: unknown): Promise<T> {
	const response = await nodeFetch(path, {
		method: body === undefined ? "GET" : "POST",
		...(body === undefined ? {} : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
	});
	const text = await response.text();
	let payload: unknown = undefined;
	if (text) {
		try {
			payload = JSON.parse(text);
		} catch {
			payload = undefined;
		}
	}
	if (!response.ok) {
		const message =
			payload && typeof payload === "object" && "error" in payload
				? String((payload as { error: unknown }).error)
				: `Plugin host returned ${response.status}`;
		throw new Error(message);
	}
	return payload as T;
}

export function listPlugins(): Promise<{ plugins: PluginInfo[] }> {
	return request("/plugins");
}

export function refreshPlugins(): Promise<{ plugins: PluginInfo[] }> {
	return request("/plugins/refresh", {});
}

export function setPluginEnabled(id: string, enabled: boolean): Promise<{ plugin: PluginInfo }> {
	return request("/plugins/enabled", { id, enabled });
}

export interface PluginToolDescriptor {
	name: string;
	label: string;
	description: string;
	parameters: unknown;
	pluginId: string;
	executionMode: "sequential" | "parallel";
}

export interface PluginQuestionDescriptor {
	pluginId: string;
	id: string;
	label: string;
	contractVersion: number;
	showThinking: boolean;
	questionSchema: unknown;
	answerSchema: unknown;
	teach?: unknown;
}

export interface PluginProblemDescriptor {
	pluginId: string;
	id: string;
	label: string;
	contractVersion: number;
	tool?: unknown;
	problemSchema: unknown;
	submissionSchema: unknown;
}

export interface PluginLoadout {
	turnId: string;
	instructions: string[];
	tools: PluginToolDescriptor[];
	questions: PluginQuestionDescriptor[];
	problems: PluginProblemDescriptor[];
	warnings: string[];
}

export function pluginLoadout(chatId: string, agent: "prober" | "teacher" | "practice"): Promise<PluginLoadout> {
	return request("/plugins/loadout", { chatId, agent });
}

export function endPluginTurn(turnId: string): Promise<{ ended: boolean }> {
	return request("/plugins/turn/end", { turnId });
}

export function executePluginTool(
	turnId: string,
	name: string,
	toolCallId: string,
	input: unknown,
): Promise<{ output: unknown }> {
	return request("/plugins/tool", { turnId, name, toolCallId, input });
}

export function callPlugin<T = unknown>(pluginId: string, operation: string, input?: unknown): Promise<{ result: T }> {
	return request("/plugins/call", { pluginId, operation, input });
}

export function gradePluginQuestion(
	pluginId: string,
	typeId: string,
	requestBody: Record<string, unknown>,
): Promise<{ result: unknown }> {
	return request("/plugins/question/grade", { pluginId, typeId, ...requestBody });
}

export function processPluginProblem(
	pluginId: string,
	typeId: string,
	requestBody: Record<string, unknown>,
): Promise<{ result: unknown }> {
	return request("/plugins/problem/process", { pluginId, typeId, ...requestBody });
}

/** Push read-only session records so plugin backends can read them. */
export async function syncLearning(records: unknown[]): Promise<void> {
	if (!records.length) return;
	await request("/plugins/learning/sync", { records });
}

export function pluginAssetUrl(id: string, path: string): string {
	return nodeAssetUrl(`/plugins/assets/${encodeURIComponent(id)}/${path.split("/").map(encodeURIComponent).join("/")}`);
}
