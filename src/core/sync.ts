/**
 * THE WEBDAV SYNC CONTRACT (webdav-sync wave, 2026-11-21): browser-safe
 * types and pure decisions shared by the server service and the Settings
 * UI. No IO, no node builtins — hashing and tar live in src/server/sync.
 *
 * The model is single-writer by design (owner decision): one device edits
 * at a time, every remote state is an immutable numbered package plus a
 * pointer, and every local record remembers the (seq, treeHash) pair it
 * last applied. A device that diverged is refused, never silently merged.
 */

/** The only package format this build writes or accepts. */
export const SYNC_FORMAT_VERSION = 1;

/** Package extension on the WebDAV server. */
export const SYNC_PACKAGE_EXT = ".lhsync";

/** Directory roots that travel whole, relative to DATA_ROOT. */
export const SYNC_DIR_ROOTS = ["chats", "graph", "prompts", "themes", "core-plugin-data"] as const;

/** The one top-level file that travels (plugins contribute only their data/). */
export const SYNC_SETTINGS_FILE = "settings.json";

/** Hard limits (checked before extraction — a hostile package must not fill
 *  the disk). The download itself is bounded by MAX_PACKAGE_BYTES. */
export const MAX_PACKAGE_BYTES = 512 * 1024 * 1024;
export const MAX_EXTRACTED_BYTES = 2 * 1024 * 1024 * 1024;
export const MAX_PACKAGE_FILES = 200_000;

/** Keep the newest N packages on the server; older ones are best-effort deleted. */
export const KEEP_REMOTE_PACKAGES = 3;

/** Automatic sync cadence. */
export const AUTO_SYNC_INTERVAL_MS = 60_000;
export const AUTO_SYNC_INITIAL_DELAY_MS = 5_000;
export const AUTO_PUSH_MIN_INTERVAL_MS = 5 * 60_000;

/** Confirmation tokens for destructive manual operations. */
export const SYNC_CONFIRM_PUSH = "overwrite-remote";
export const SYNC_CONFIRM_PULL = "replace-local";

export type SyncDirection = "push" | "pull";

export type SyncConflictKind =
	| "remote_ahead"
	| "remote_rollback"
	| "remote_diverged"
	| "local_changed"
	| "remote_empty"
	| "local_empty";

export interface SyncFileEntry {
	path: string;
	size: number;
	sha256: string;
}

/** One package's table of contents. `data` stamps the source build's record
 *  formats so a newer writer cannot be imported by an older reader. */
export interface SyncManifest {
	formatVersion: number;
	appVersion: string;
	deviceId: string;
	seq: number;
	createdAt: string;
	treeHash: string;
	data: {
		chatVersion: number;
		graphFormatVersion: number;
		settingsVersion: number;
	};
	files: SyncFileEntry[];
}

/** The mutable pointer at the remote root. Written LAST, after the package. */
export interface SyncRemotePointer {
	formatVersion: number;
	seq: number;
	treeHash: string;
	appVersion: string;
	deviceId: string;
	createdAt: string;
	package: { name: string; size: number; sha256: string };
}

export interface SyncConfigRecord {
	version: 1;
	/** Normalized base URL, always ending in "/". */
	url: string;
	username: string;
	/** Plaintext by the owner's explicit decision (HTTP + Basic auth). */
	password: string;
	autoSync: boolean;
}

export interface SyncRemoteSnapshot {
	seq: number;
	treeHash: string;
	packageBytes: number;
	checkedAt: string;
}

export interface SyncStateRecord {
	version: 1;
	deviceId: string;
	remoteUrl: string | null;
	lastAppliedSeq: number;
	lastSyncedTreeHash: string | null;
	lastSyncedAt: string | null;
	lastDirection: SyncDirection | null;
	lastError: string | null;
	lastRemote: SyncRemoteSnapshot | null;
	lastTransfer: SyncLastTransfer | null;
	/** Package names this device wrote, newest last — the only listing the
	 *  protocol has (PROPFIND is disabled on the server). */
	recentPackages: string[];
}

export type SyncPhase = "idle" | "scanning" | "uploading" | "downloading" | "applying";

export interface SyncProgress {
	phase: SyncPhase;
	transferredBytes: number;
	totalBytes: number;
}

export interface SyncLocalSummary {
	treeHash: string;
	fileCount: number;
	/** Sum of the files' sizes — "how big is my learning data". */
	totalBytes: number;
	scannedAt: string;
}

export interface SyncLastTransfer {
	direction: SyncDirection;
	bytes: number;
	packageName: string;
	at: string;
}

/** GET /api/sync/status — everything the Settings card renders. Never
 *  carries the password. */
export interface SyncStatusPayload {
	configured: boolean;
	autoSync: boolean;
	url: string | null;
	username: string | null;
	deviceId: string;
	busy: boolean;
	busyReason: "turn" | "job" | "syncing" | null;
	syncing: boolean;
	progress: SyncProgress | null;
	local: SyncLocalSummary | null;
	remote: SyncRemoteSnapshot | null;
	lastAppliedSeq: number;
	lastSyncedTreeHash: string | null;
	lastSyncedAt: string | null;
	lastDirection: SyncDirection | null;
	lastError: string | null;
	lastTransfer: SyncLastTransfer | null;
	conflict: { kind: SyncConflictKind } | null;
	insecureHttp: boolean;
	nextCheckAt: string | null;
}

export type PushDecision =
	| { kind: "push"; seq: number }
	| { kind: "up_to_date"; seq: number }
	| { kind: "conflict"; conflict: SyncConflictKind; remoteSeq: number };

export type PullDecision =
	| { kind: "pull"; seq: number }
	| { kind: "up_to_date"; seq: number }
	| { kind: "no_remote" }
	| { kind: "conflict"; conflict: SyncConflictKind; remoteSeq: number };

/**
 * Whether a push may replace the remote at a new seq. `force` bypasses the
 * conflicts (the UI gates it behind SYNC_CONFIRM_PUSH); automatic sync never
 * passes force, so a diverged pair stops instead of overwriting.
 */
export function decidePush(input: {
	localTreeHash: string;
	lastAppliedSeq: number;
	lastSyncedTreeHash: string | null;
	remote: { seq: number; treeHash: string } | null;
	force?: boolean;
}): PushDecision {
	const { remote, force = false } = input;
	if (!remote) return { kind: "push", seq: input.lastAppliedSeq + 1 };
	if (remote.seq > input.lastAppliedSeq) {
		if (!force) return { kind: "conflict", conflict: "remote_ahead", remoteSeq: remote.seq };
		return { kind: "push", seq: remote.seq + 1 };
	}
	if (remote.seq < input.lastAppliedSeq) {
		if (!force) return { kind: "conflict", conflict: "remote_rollback", remoteSeq: remote.seq };
		return { kind: "push", seq: input.lastAppliedSeq + 1 };
	}
	if (remote.treeHash !== input.lastSyncedTreeHash) {
		if (!force) return { kind: "conflict", conflict: "remote_diverged", remoteSeq: remote.seq };
		return { kind: "push", seq: input.lastAppliedSeq + 1 };
	}
	if (input.localTreeHash === input.lastSyncedTreeHash) {
		return { kind: "up_to_date", seq: remote.seq };
	}
	return { kind: "push", seq: input.lastAppliedSeq + 1 };
}

/**
 * Whether a pull may replace local data. `localEmpty` is the first-boot
 * exception: a device that has never synced AND holds no learning data may
 * pull; one that holds data must push first (or force-replace, with the
 * confirmation token).
 */
export function decidePull(input: {
	localTreeHash: string;
	localEmpty: boolean;
	lastAppliedSeq: number;
	lastSyncedTreeHash: string | null;
	remote: { seq: number; treeHash: string } | null;
	force?: boolean;
}): PullDecision {
	const { remote, force = false } = input;
	if (!remote) return { kind: "no_remote" };
	if (!force) {
		const localClean =
			input.lastSyncedTreeHash !== null
				? input.localTreeHash === input.lastSyncedTreeHash
				: input.localEmpty;
		if (!localClean) return { kind: "conflict", conflict: "local_changed", remoteSeq: remote.seq };
		if (remote.seq < input.lastAppliedSeq) {
			return { kind: "conflict", conflict: "remote_rollback", remoteSeq: remote.seq };
		}
		if (remote.seq === input.lastAppliedSeq) {
			if (remote.treeHash === input.localTreeHash) return { kind: "up_to_date", seq: remote.seq };
			return { kind: "conflict", conflict: "remote_diverged", remoteSeq: remote.seq };
		}
	}
	return { kind: "pull", seq: remote.seq };
}

/** Normalize the user's base URL: http(s), absolute, no query/hash, and a
 *  single trailing slash. Returns null for anything unusable. */
export function normalizeSyncUrl(raw: string): string | null {
	const trimmed = raw.trim();
	if (!trimmed) return null;
	let url: URL;
	try {
		url = new URL(trimmed);
	} catch {
		return null;
	}
	if (url.protocol !== "http:" && url.protocol !== "https:") return null;
	if (url.username || url.password) return null;
	if (url.search || url.hash) return null;
	const pathname = url.pathname.endsWith("/") ? url.pathname : `${url.pathname}/`;
	return `${url.protocol}//${url.host}${pathname}`;
}

/** True when the URL would send Basic-auth credentials over plain HTTP. */
export function isInsecureHttp(url: string | null | undefined): boolean {
	return typeof url === "string" && url.toLowerCase().startsWith("http://");
}

/** One relative path may enter or leave a package. Rejects traversal,
 *  Windows separators, drive letters, NUL and anything outside the roots. */
export function isSafeSyncPath(relative: string): boolean {
	if (!relative || relative.length > 1024) return false;
	if (relative.includes("\\") || relative.includes("\0")) return false;
	if (relative.startsWith("/") || /^[A-Za-z]:/.test(relative)) return false;
	const parts = relative.split("/");
	if (parts.some((part) => part === "" || part === "." || part === "..")) return false;
	if (relative === SYNC_SETTINGS_FILE) return true;
	const head = parts[0] ?? "";
	if ((SYNC_DIR_ROOTS as readonly string[]).includes(head)) return true;
	if (head === "plugins") {
		const pluginId = parts[1] ?? "";
		if (parts.length < 4 || parts[2] !== "data") return false;
		return /^[A-Za-z0-9._-]+$/.test(pluginId) && pluginId !== ".";
	}
	return false;
}

/** JSON with object keys sorted recursively — the stable byte form hashes
 *  are computed over. Arrays keep their order (file lists are pre-sorted). */
export function canonicalJson(value: unknown): string {
	return JSON.stringify(canonicalize(value));
}

function canonicalize(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(canonicalize);
	if (value && typeof value === "object") {
		const record = value as Record<string, unknown>;
		const out: Record<string, unknown> = {};
		for (const key of Object.keys(record).sort()) out[key] = canonicalize(record[key]);
		return out;
	}
	return value;
}

/** The remote copy of settings.json omits `agent.fileAccess`: it is a
 *  device-local security choice, never shared. */
export function projectSettingsForSync(settings: unknown): unknown {
	if (!settings || typeof settings !== "object" || Array.isArray(settings)) return settings;
	const copy = JSON.parse(JSON.stringify(settings)) as Record<string, unknown>;
	const agent = copy.agent;
	if (agent && typeof agent === "object" && !Array.isArray(agent)) delete (agent as Record<string, unknown>).fileAccess;
	return copy;
}

/** Merge a remote settings record with THIS device's fileAccess value —
 *  the import half of the projection above. */
export function mergeSettingsPreservingFileAccess(remote: unknown, local: unknown): unknown {
	const next = JSON.parse(JSON.stringify(remote)) as Record<string, unknown>;
	const localAgent =
		local && typeof local === "object" && !Array.isArray(local)
			? ((local as Record<string, unknown>).agent as Record<string, unknown> | undefined)
			: undefined;
	const localFileAccess = localAgent?.fileAccess;
	if (localFileAccess === undefined) return next;
	const agent = next.agent;
	const agentRecord = agent && typeof agent === "object" && !Array.isArray(agent) ? (agent as Record<string, unknown>) : {};
	next.agent = { ...agentRecord, fileAccess: localFileAccess };
	return next;
}
