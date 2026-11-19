/**
 * The on-device session record.
 *
 * The transcript is the source of truth: it holds pi-native messages
 * (user / assistant / toolResult) exactly as the agent loop produced them,
 * plus the two side tables the UI needs — the learner's answers (keyed by
 * toolCallId, the same shape the desktop record stores inside the tool
 * result) and the latest plan tree.
 *
 * Everything lives in localStorage; keys never do.
 */

import { useSyncExternalStore } from "react";
import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { QuestionAnswerData } from "@/src/core/question-core.ts";
import type { PlanTree } from "@/src/core/contracts/plan.ts";
import { hasProbeDone, type LhMessage } from "@/src/core/native-messages.ts";

export type SessionKind = "teach" | "practice";
export type SessionPhase = "probe" | "teach";

export interface MobileSession {
	id: string;
	title: string;
	kind: SessionKind;
	createdAt: string;
	updatedAt: string;
	messages: AgentMessage[];
	/**
	 * The learner's full graded answer per question toolCallId. The tool
	 * result in `messages` carries only the compact model-facing view.
	 */
	answers: Record<string, QuestionAnswerData>;
	/** The latest plan authored with plan_init. */
	tree?: PlanTree;
}

const STORAGE_KEY = "lh:mobile:sessions:v1";

function iso(offsetMs: number): string {
	return new Date(Date.now() - offsetMs).toISOString();
}

function newId(): string {
	if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
	return `id-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function userMessage(text: string, timestamp = Date.now()): AgentMessage {
	return { role: "user", content: [{ type: "text", text }], timestamp };
}

function legacyAssistant(text: string, createdAt?: string): AgentMessage {
	return {
		role: "assistant",
		content: [{ type: "text", text }],
		api: "openai-completions",
		provider: "custom",
		model: "legacy",
		usage: {
			input: 0,
			output: 0,
			cacheRead: 0,
			cacheWrite: 0,
			totalTokens: 0,
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
		},
		stopReason: "stop",
		timestamp: Date.parse(createdAt ?? "") || Date.now(),
	} as AgentMessage;
}

/** Old records carried `{role, text}`; new ones are pi messages. */
function migrateMessage(raw: unknown): AgentMessage | null {
	if (!raw || typeof raw !== "object") return null;
	const message = raw as { role?: unknown; content?: unknown; text?: unknown; createdAt?: unknown };
	if (typeof message.role === "string" && "content" in message) return raw as AgentMessage;
	if (typeof message.text !== "string") return null;
	if (message.role === "assistant") return legacyAssistant(message.text, typeof message.createdAt === "string" ? message.createdAt : undefined);
	return userMessage(message.text, Date.parse(typeof message.createdAt === "string" ? message.createdAt : "") || Date.now());
}

function migrateSession(raw: unknown): MobileSession | null {
	if (!raw || typeof raw !== "object") return null;
	const session = raw as Partial<MobileSession> & { messages?: unknown };
	if (typeof session.id !== "string" || typeof session.title !== "string") return null;
	const messages = Array.isArray(session.messages)
		? session.messages.map(migrateMessage).filter((message): message is AgentMessage => message !== null)
		: [];
	return {
		id: session.id,
		title: session.title,
		kind: session.kind === "practice" ? "practice" : "teach",
		createdAt: typeof session.createdAt === "string" ? session.createdAt : new Date().toISOString(),
		updatedAt: typeof session.updatedAt === "string" ? session.updatedAt : new Date().toISOString(),
		messages,
		answers: session.answers && typeof session.answers === "object" ? session.answers : {},
		tree: session.tree && Array.isArray(session.tree.nodes) ? session.tree : undefined,
	};
}

function seed(): MobileSession[] {
	const teach: MobileSession = {
		id: "demo-teach",
		title: "二次函数的最值",
		kind: "teach",
		createdAt: iso(3 * 3600_000),
		updatedAt: iso(2 * 3600_000),
		messages: [
			userMessage("我想弄懂二次函数什么时候取到最大值、什么时候取到最小值，总是搞混。", Date.now() - 3 * 3600_000),
			legacyAssistant(
				"先不急着记公式。你能说说 y = x² 的图像在 x = 0 附近是什么样子吗？它有没有最大值？",
				iso(2 * 3600_000),
			),
		],
		answers: {},
	};
	const practice: MobileSession = {
		id: "demo-practice",
		title: "英语时态辨析",
		kind: "practice",
		createdAt: iso(26 * 3600_000),
		updatedAt: iso(25 * 3600_000),
		messages: [
			legacyAssistant("练习：选出正确的时态 — “I ____ here since 2019.”（live）", iso(25 * 3600_000)),
		],
		answers: {},
	};
	return [teach, practice];
}

let cache: MobileSession[] | null = null;
const listeners = new Set<() => void>();

function read(): MobileSession[] {
	if (cache) return cache;
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (raw) {
			const parsed = JSON.parse(raw) as unknown;
			if (Array.isArray(parsed)) {
				cache = parsed.map(migrateSession).filter((session): session is MobileSession => session !== null);
				return cache;
			}
		}
	} catch {
		/* corrupt or unavailable — reseed */
	}
	cache = seed();
	write(cache);
	return cache;
}

function write(next: MobileSession[]) {
	cache = next;
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
	} catch {
		/* quota/unavailable: the in-memory copy remains */
	}
	for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

export function useSessions(): MobileSession[] {
	return useSyncExternalStore(subscribe, read, read);
}

export function getSession(id: string): MobileSession | undefined {
	return read().find((session) => session.id === id);
}

export function useSession(id: string): MobileSession | undefined {
	const sessions = useSessions();
	return sessions.find((session) => session.id === id);
}

function titleFrom(text: string): string {
	const line = text.trim().split("\n")[0] ?? "";
	return line.length > 40 ? `${line.slice(0, 40)}…` : line;
}

function updateSession(id: string, update: (session: MobileSession) => MobileSession): void {
	const next = read().map((session) => (session.id === id ? update(session) : session));
	write(next);
}

export function createSession(firstMessage: string, kind: SessionKind): MobileSession {
	const text = firstMessage.trim();
	const now = new Date().toISOString();
	const session: MobileSession = {
		id: newId(),
		title: titleFrom(text),
		kind,
		createdAt: now,
		updatedAt: now,
		messages: [userMessage(text)],
		answers: {},
	};
	write([session, ...read()]);
	return session;
}

/** Append one pi-native message (user, assistant, toolResult…). */
export function appendMessage(sessionId: string, message: AgentMessage): void {
	updateSession(sessionId, (session) => ({
		...session,
		messages: [...session.messages, message],
		updatedAt: new Date().toISOString(),
	}));
}

export function saveAnswer(sessionId: string, toolCallId: string, answer: QuestionAnswerData): void {
	updateSession(sessionId, (session) => ({
		...session,
		answers: { ...session.answers, [toolCallId]: answer },
		updatedAt: new Date().toISOString(),
	}));
}

export function saveTree(sessionId: string, tree: PlanTree): void {
	updateSession(sessionId, (session) => ({
		...session,
		tree,
		updatedAt: new Date().toISOString(),
	}));
}

/** The probe→teach seam: the FIRST successful probe_done in the transcript
 *  (a call plus its matching non-error result) switches every later turn to
 *  the teacher's prompt and tools. */
export function sessionPhase(session: MobileSession): SessionPhase {
	return hasProbeDone(session.messages as unknown as readonly LhMessage[]) ? "teach" : "probe";
}
