/**
 * The P1 session store — localStorage only, no network and no server.
 *
 * It exists to make the mobile shell browsable with realistic data: seed
 * two sessions on first launch, then keep every change in the same place.
 * P2 replaces this module with the on-device record + turn engine; the
 * pages consume the same shape.
 */

import { useSyncExternalStore } from "react";

export type SessionKind = "teach" | "practice";
export type MessageRole = "user" | "assistant";

export interface MobileMessage {
	id: string;
	role: MessageRole;
	text: string;
	createdAt: string;
}

export interface MobileSession {
	id: string;
	title: string;
	kind: SessionKind;
	createdAt: string;
	updatedAt: string;
	messages: MobileMessage[];
}

const STORAGE_KEY = "lh:mobile:sessions:v1";

function iso(offsetMs: number): string {
	return new Date(Date.now() - offsetMs).toISOString();
}

function newId(): string {
	if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
	return `id-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function seed(): MobileSession[] {
	const teach: MobileSession = {
		id: "demo-teach",
		title: "二次函数的最值",
		kind: "teach",
		createdAt: iso(3 * 3600_000),
		updatedAt: iso(2 * 3600_000),
		messages: [
			{
				id: "demo-teach-1",
				role: "user",
				text: "我想弄懂二次函数什么时候取到最大值、什么时候取到最小值，总是搞混。",
				createdAt: iso(3 * 3600_000),
			},
			{
				id: "demo-teach-2",
				role: "assistant",
				text: "先不急着记公式。你能说说 y = x² 的图像在 x = 0 附近是什么样子吗？它有没有最大值？",
				createdAt: iso(2 * 3600_000),
			},
		],
	};
	const practice: MobileSession = {
		id: "demo-practice",
		title: "英语时态辨析",
		kind: "practice",
		createdAt: iso(26 * 3600_000),
		updatedAt: iso(25 * 3600_000),
		messages: [
			{
				id: "demo-practice-1",
				role: "assistant",
				text: "练习：选出正确的时态 — “I ____ here since 2019.”（live）",
				createdAt: iso(25 * 3600_000),
			},
		],
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
				cache = parsed as MobileSession[];
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

export function createSession(firstMessage: string, kind: SessionKind): MobileSession {
	const text = firstMessage.trim();
	const now = new Date().toISOString();
	const session: MobileSession = {
		id: newId(),
		title: titleFrom(text) || (kind === "practice" ? "New practice session" : "New session"),
		kind,
		createdAt: now,
		updatedAt: now,
		messages: [{ id: newId(), role: "user", text, createdAt: now }],
	};
	write([session, ...read()]);
	return session;
}

export function appendMessage(sessionId: string, role: MessageRole, text: string): void {
	const now = new Date().toISOString();
	write(
		read().map((session) =>
			session.id === sessionId
				? {
						...session,
						updatedAt: now,
						messages: [...session.messages, { id: newId(), role, text, createdAt: now }],
					}
				: session,
		),
	);
}

export function deleteSession(sessionId: string): void {
	write(read().filter((session) => session.id !== sessionId));
}
