/**
 * The sync service (webdav-sync wave, 2026-11-21): status, connection test,
 * push, pull, import swapping and the automatic loop.
 *
 * Concurrency: one process-wide lock (globalThis) — a manual operation and
 * the auto loop never overlap, and a second manual request gets 409. The
 * import never runs while a turn or a background job is writing: the data
 * it would swap is live.
 *
 * Single-writer contract: push bumps the remote seq only when the remote is
 * exactly where this device left it; pull only replaces local data that is
 * still exactly where this device left it. `force` is the explicit escape
 * hatch and is never used by the automatic loop.
 */

import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { PATHS } from "../../../config.ts";
import { emit } from "../../core/events.ts";
import {
	AUTO_PUSH_MIN_INTERVAL_MS,
	AUTO_SYNC_INITIAL_DELAY_MS,
	AUTO_SYNC_INTERVAL_MS,
	KEEP_REMOTE_PACKAGES,
	MAX_PACKAGE_BYTES,
	SYNC_CONFIRM_PULL,
	SYNC_CONFIRM_PUSH,
	SYNC_DIR_ROOTS,
	SYNC_FORMAT_VERSION,
	SYNC_SETTINGS_FILE,
	decidePull,
	decidePush,
	isInsecureHttp,
	mergeSettingsPreservingFileAccess,
	normalizeSyncUrl,
	type PullDecision,
	type PushDecision,
	type SyncConflictKind,
	type SyncConfigRecord,
	type SyncLastTransfer,
	type SyncProgress,
	type SyncRemotePointer,
	type SyncStatusPayload,
} from "../../core/sync.ts";
import { anyTurnRunning } from "../turn-liveness.ts";
import { writeFileAtomicSync } from "../../store/atomic-write.ts";
import { buildPackage, extractPackage, readStagedSettings, SyncPackageError } from "./archive.ts";
import { readSyncConfig, readSyncJournal, readSyncState, updateSyncState, writeSyncConfig, writeSyncJournal, clearSyncJournal, clearSyncConfig } from "./store.ts";
import { invalidateLocalTreeCache, scanLocalTree, type LocalTreeSnapshot } from "./tree.ts";
import { downloadFile, getJson, makeCollection, putJson, uploadFile, deleteFile, WebdavError, type WebdavOptions } from "./webdav.ts";

export class SyncServiceError extends Error {
	constructor(
		message: string,
		readonly status = 400,
		readonly code?: string,
		readonly detail?: unknown,
	) {
		super(message);
	}
}

interface RuntimeState {
	running: boolean;
	progress: SyncProgress | null;
	conflict: SyncConflictKind | null;
	nextCheckAt: string | null;
	lastAutoPushAt: number;
	timer: NodeJS.Timeout | null;
	initialTimer: NodeJS.Timeout | null;
}

interface SyncGlobal {
	__lhSyncRuntime?: RuntimeState;
}

function runtime(): RuntimeState {
	const g = globalThis as typeof globalThis & SyncGlobal;
	return (g.__lhSyncRuntime ??= {
		running: false,
		progress: null,
		conflict: null,
		nextCheckAt: null,
		lastAutoPushAt: 0,
		timer: null,
		initialTimer: null,
	});
}

function appVersion(): string {
	return process.env.LH_VERSION ?? "dev";
}

function clientFor(config: SyncConfigRecord): WebdavOptions {
	return { url: config.url, username: config.username, password: config.password };
}

function requireConfig(): SyncConfigRecord {
	const config = readSyncConfig();
	if (!config) throw new SyncServiceError("Sync is not configured yet.", 400, "sync.not_configured");
	return config;
}

function brush(error: unknown): string {
	if (error instanceof WebdavError) {
		if (error.status === 401 || error.status === 403) return "The sync server rejected the credentials.";
		if (error.status === 507) return "The sync server is out of disk space.";
		return error.message;
	}
	if (error instanceof SyncPackageError) return error.message;
	if (error instanceof SyncServiceError) return error.message;
	return error instanceof Error ? error.message : String(error);
}

/** A running background job could still write its record while we swap
 *  directories; the job store's own recovery must see a stable data dir. */
function hasRunningJobs(): boolean {
	const dir = path.join(PATHS.data, "jobs");
	let names: string[] = [];
	try {
		names = fs.readdirSync(dir);
	} catch {
		return false;
	}
	for (const name of names) {
		if (!name.endsWith(".json")) continue;
		try {
			const record = JSON.parse(fs.readFileSync(path.join(dir, name), "utf8")) as { status?: unknown };
			if (record.status === "running") return true;
		} catch {
			// Unreadable job records are not running.
		}
	}
	return false;
}

function busyReason(): SyncStatusPayload["busyReason"] {
	const g = runtime();
	if (g.running) return "syncing";
	if (anyTurnRunning()) return "turn";
	if (hasRunningJobs()) return "job";
	return null;
}

export function syncStatus(): SyncStatusPayload {
	const config = readSyncConfig();
	const state = readSyncState();
	const g = runtime();
	let local: LocalTreeSnapshot | null = null;
	try {
		local = scanLocalTree();
	} catch {
		local = null;
	}
	const busy = busyReason();
	return {
		configured: Boolean(config),
		autoSync: config?.autoSync ?? false,
		url: config?.url ?? null,
		username: config?.username ?? null,
		deviceId: state.deviceId,
		busy: busy !== null,
		busyReason: busy,
		syncing: g.running,
		progress: g.progress,
		local: local
			? {
					treeHash: local.treeHash,
					fileCount: local.files.length,
					totalBytes: local.totalBytes,
					scannedAt: local.scannedAt,
				}
			: null,
		remote: state.lastRemote,
		lastAppliedSeq: state.lastAppliedSeq,
		lastSyncedTreeHash: state.lastSyncedTreeHash,
		lastSyncedAt: state.lastSyncedAt,
		lastDirection: state.lastDirection,
		lastError: state.lastError,
		lastTransfer: state.lastTransfer,
		conflict: g.conflict ? { kind: g.conflict } : null,
		insecureHttp: isInsecureHttp(config?.url),
		nextCheckAt: config?.autoSync ? g.nextCheckAt : null,
	};
}

export interface SaveConfigInput {
	url?: unknown;
	username?: unknown;
	password?: unknown;
	autoSync?: unknown;
}

export function saveSyncConfig(input: SaveConfigInput): SyncStatusPayload {
	const rawUrl = typeof input.url === "string" ? input.url : "";
	const url = normalizeSyncUrl(rawUrl);
	if (!url) throw new SyncServiceError("Enter an http(s) URL, for example http://1.2.3.4:21050/lh-sync/", 400, "sync.invalid_url");
	const username = typeof input.username === "string" ? input.username.trim() : "";
	if (!username) throw new SyncServiceError("A username is required.", 400, "sync.invalid_username");
	const existing = readSyncConfig();
	const suppliedPassword = typeof input.password === "string" ? input.password : "";
	const password = suppliedPassword || existing?.password || "";
	if (!password) throw new SyncServiceError("A password is required.", 400, "sync.invalid_password");
	const autoSync = input.autoSync === undefined ? existing?.autoSync ?? true : input.autoSync !== false;
	writeSyncConfig({ version: 1, url, username, password, autoSync });
	// A new endpoint invalidates the last observed remote; the next check
	// fills it in.
	updateSyncState({ remoteUrl: url, lastRemote: existing && existing.url === url ? readSyncState().lastRemote : null, lastError: null });
	runtime().conflict = null;
	emit("sync-changed", {});
	return syncStatus();
}

export function deleteSyncConfig(): SyncStatusPayload {
	clearSyncConfig();
	runtime().conflict = null;
	emit("sync-changed", {});
	return syncStatus();
}

export interface ConnectionTestResult {
	ok: boolean;
	remote: "empty" | "ready";
	url: string;
	username: string;
	insecureHttp: boolean;
	local: { treeHash: string; fileCount: number; totalBytes: number };
	remotePointer: { seq: number; treeHash: string; packageBytes: number; createdAt: string } | null;
	action: "push" | "pull" | "up_to_date" | "conflict";
	conflict?: SyncConflictKind;
}

export async function testSyncConnection(): Promise<ConnectionTestResult> {
	const config = requireConfig();
	const state = readSyncState();
	const client = clientFor(config);
	let pointer: SyncRemotePointer | null;
	try {
		pointer = await readPointer(client);
	} catch (error) {
		throw new SyncServiceError(brush(error), 502, "sync.unreachable");
	}
	const local = scanLocalTree({ force: true });
	const localEmpty = local.files.length === 0;
	const push = decidePush({
		localTreeHash: local.treeHash,
		lastAppliedSeq: state.lastAppliedSeq,
		lastSyncedTreeHash: state.lastSyncedTreeHash,
		remote: pointer ? { seq: pointer.seq, treeHash: pointer.treeHash } : null,
	});
	const pull = decidePull({
		localTreeHash: local.treeHash,
		localEmpty,
		lastAppliedSeq: state.lastAppliedSeq,
		lastSyncedTreeHash: state.lastSyncedTreeHash,
		remote: pointer ? { seq: pointer.seq, treeHash: pointer.treeHash } : null,
	});
	let action: ConnectionTestResult["action"] = "up_to_date";
	let conflict: SyncConflictKind | undefined;
	if (!pointer) action = localEmpty ? "up_to_date" : "push";
	else if (push.kind === "up_to_date" || pull.kind === "up_to_date") action = "up_to_date";
	else if (pull.kind === "pull") action = "pull";
	else if (push.kind === "push") action = "push";
	else {
		action = "conflict";
		conflict = push.kind === "conflict" ? push.conflict : pull.kind === "conflict" ? pull.conflict : "remote_diverged";
	}
	return {
		ok: true,
		remote: pointer ? "ready" : "empty",
		url: config.url,
		username: config.username,
		insecureHttp: isInsecureHttp(config.url),
		local: { treeHash: local.treeHash, fileCount: local.files.length, totalBytes: local.totalBytes },
		remotePointer: pointer
			? { seq: pointer.seq, treeHash: pointer.treeHash, packageBytes: pointer.package.size, createdAt: pointer.createdAt }
			: null,
		action,
		...(conflict ? { conflict } : {}),
	};
}

function parsePointer(raw: unknown): SyncRemotePointer {
	if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new SyncPackageError("The remote pointer is invalid — refusing to continue.");
	const record = raw as Record<string, unknown>;
	const pkg = record.package;
	if (!pkg || typeof pkg !== "object" || Array.isArray(pkg)) throw new SyncPackageError("The remote pointer is invalid — refusing to continue.");
	const pack = pkg as Record<string, unknown>;
	if (
		record.formatVersion !== SYNC_FORMAT_VERSION ||
		typeof record.seq !== "number" ||
		!Number.isInteger(record.seq) ||
		record.seq < 1 ||
		typeof record.treeHash !== "string" ||
		!/^[0-9a-f]{64}$/.test(record.treeHash) ||
		typeof pack.name !== "string" ||
		!/^packages\/[A-Za-z0-9._-]+\.lhsync$/.test(pack.name) ||
		typeof pack.size !== "number" ||
		pack.size <= 0 ||
		pack.size > MAX_PACKAGE_BYTES ||
		typeof pack.sha256 !== "string" ||
		!/^[0-9a-f]{64}$/.test(pack.sha256)
	) {
		throw new SyncPackageError("The remote pointer is invalid — refusing to continue.");
	}
	return {
		formatVersion: SYNC_FORMAT_VERSION,
		seq: record.seq,
		treeHash: record.treeHash,
		appVersion: typeof record.appVersion === "string" ? record.appVersion : "unknown",
		deviceId: typeof record.deviceId === "string" ? record.deviceId : "unknown",
		createdAt: typeof record.createdAt === "string" ? record.createdAt : new Date().toISOString(),
		package: { name: pack.name, size: pack.size, sha256: pack.sha256 },
	};
}

async function readPointer(client: WebdavOptions): Promise<SyncRemotePointer | null> {
	const raw = await getJson(client, "current.json");
	if (raw === null) {
		updateSyncState({ lastRemote: null });
		return null;
	}
	const pointer = parsePointer(raw);
	updateSyncState({
		lastRemote: {
			seq: pointer.seq,
			treeHash: pointer.treeHash,
			packageBytes: pointer.package.size,
			checkedAt: new Date().toISOString(),
		},
	});
	return pointer;
}

export interface PushResult {
	ok: boolean;
	kind: "pushed" | "up_to_date" | "conflict";
	seq?: number;
	treeHash?: string;
	package?: { name: string; size: number; sha256: string };
	local?: { fileCount: number; totalBytes: number };
	conflict?: { kind: SyncConflictKind; remoteSeq: number };
}

export interface PullResult {
	ok: boolean;
	kind: "pulled" | "up_to_date" | "no_remote" | "conflict";
	seq?: number;
	treeHash?: string;
	backupDir?: string | null;
	imported?: { fileCount: number; totalBytes: number };
	packageBytes?: number;
	conflict?: { kind: SyncConflictKind; remoteSeq: number };
}

async function exclusive<T>(fn: () => Promise<T>): Promise<T> {
	const g = runtime();
	if (g.running) throw new SyncServiceError("A sync operation is already running.", 409, "sync.busy");
	g.running = true;
	g.progress = { phase: "scanning", transferredBytes: 0, totalBytes: 0 };
	try {
		return await fn();
	} finally {
		g.running = false;
		g.progress = null;
	}
}

function assertIdle(): void {
	if (anyTurnRunning()) throw new SyncServiceError("A teaching turn is running — try again when it finishes.", 409, "sync.busy");
	if (hasRunningJobs()) throw new SyncServiceError("A background job is running — try again when it finishes.", 409, "sync.busy");
}

function setProgress(phase: SyncProgress["phase"], transferredBytes = 0, totalBytes = 0): void {
	runtime().progress = { phase, transferredBytes, totalBytes };
}

function clearConflict(): void {
	runtime().conflict = null;
}

function recordConflict(kind: SyncConflictKind): void {
	runtime().conflict = kind;
}

export async function pushSync(input: { force?: boolean; confirm?: string } = {}): Promise<PushResult> {
	const config = requireConfig();
	if (input.force && input.confirm !== SYNC_CONFIRM_PUSH) {
		throw new SyncServiceError("Force push requires the confirmation token.", 400, "sync.confirm_required");
	}
	recoverJournal();
	assertIdle();
	return exclusive(() => pushWith(config, input.force === true));
}

async function pushWith(config: SyncConfigRecord, force: boolean): Promise<PushResult> {
	const client = clientFor(config);
	setProgress("scanning");
	const local = scanLocalTree({ force: true });
	let state = readSyncState();
	const pointer = await readPointer(client);
	state = readSyncState();
	const decision: PushDecision = decidePush({
		localTreeHash: local.treeHash,
		lastAppliedSeq: state.lastAppliedSeq,
		lastSyncedTreeHash: state.lastSyncedTreeHash,
		remote: pointer ? { seq: pointer.seq, treeHash: pointer.treeHash } : null,
		force,
	});
	if (decision.kind === "up_to_date") {
		clearConflict();
		updateSyncState({ lastError: null });
		return { ok: true, kind: "up_to_date", seq: decision.seq, treeHash: local.treeHash };
	}
	if (decision.kind === "conflict") {
		recordConflict(decision.conflict);
		return { ok: false, kind: "conflict", conflict: { kind: decision.conflict, remoteSeq: decision.remoteSeq } };
	}
	await makeCollection(client, "packages");
	const built = await buildPackage({ snapshot: local, seq: decision.seq, deviceId: state.deviceId, appVersion: appVersion() });
	let packageName: string;
	try {
		packageName = `packages/${path.basename(built.filePath)}`;
		setProgress("uploading", 0, built.size);
		const uploaded = await uploadFile(client, packageName, built.filePath, built.size, (transferred, total) =>
			setProgress("uploading", transferred, total),
		);
		if (uploaded.sha256 !== built.sha256) throw new SyncPackageError("The uploaded package checksum changed in transit.");
		const pointerPayload: SyncRemotePointer = {
			formatVersion: SYNC_FORMAT_VERSION,
			seq: decision.seq,
			treeHash: local.treeHash,
			appVersion: appVersion(),
			deviceId: state.deviceId,
			createdAt: new Date().toISOString(),
			package: { name: packageName, size: built.size, sha256: built.sha256 },
		};
		await putJson(client, "current.json", pointerPayload);
	} finally {
		built.cleanup();
	}
	const transfer: SyncLastTransfer = {
		direction: "push",
		bytes: built.size,
		packageName,
		at: new Date().toISOString(),
	};
	const recentPackages = [...state.recentPackages, packageName].slice(-KEEP_REMOTE_PACKAGES);
	const stale = state.recentPackages.slice(0, Math.max(0, state.recentPackages.length + 1 - KEEP_REMOTE_PACKAGES));
	for (const old of stale) {
		try {
			await deleteFile(client, old);
		} catch {
			// Best-effort: a stale package is harmless.
		}
	}
	updateSyncState({
		lastAppliedSeq: decision.seq,
		lastSyncedTreeHash: local.treeHash,
		lastSyncedAt: new Date().toISOString(),
		lastDirection: "push",
		lastError: null,
		remoteUrl: config.url,
		lastTransfer: transfer,
		recentPackages,
		lastRemote: {
			seq: decision.seq,
			treeHash: local.treeHash,
			packageBytes: built.size,
			checkedAt: new Date().toISOString(),
		},
	});
	clearConflict();
	invalidateLocalTreeCache();
	emit("sync-changed", {});
	return {
		ok: true,
		kind: "pushed",
		seq: decision.seq,
		treeHash: local.treeHash,
		package: { name: packageName, size: built.size, sha256: built.sha256 },
		local: { fileCount: local.files.length, totalBytes: local.totalBytes },
	};
}

/** One "sync now" by hand (the top-bar control). Not a new protocol: it is
 *  the automatic step minus the throttle — pull when this device is clean
 *  and the server is ahead, push when this device changed and the server is
 *  untouched, stop with the conflict otherwise. Never forces. */
export interface SyncNowOutcome {
	ok: boolean;
	kind: "up_to_date" | "pushed" | "pulled" | "conflict";
	seq?: number;
	conflict?: { kind: SyncConflictKind; remoteSeq: number };
	pushed?: PushResult;
	pulled?: PullResult;
}

export async function syncNow(): Promise<SyncNowOutcome> {
	const config = requireConfig();
	recoverJournal();
	assertIdle();
	return exclusive(() => manualStep(config));
}

async function manualStep(config: SyncConfigRecord): Promise<SyncNowOutcome> {
	const client = clientFor(config);
	setProgress("scanning");
	const local = scanLocalTree({ force: true });
	const pointer = await readPointer(client);
	const state = readSyncState();
	if (!pointer) {
		if (local.files.length === 0) {
			clearConflict();
			return { ok: true, kind: "up_to_date" };
		}
		const pushed = await pushWith(config, false);
		if (pushed.kind === "conflict") {
			return { ok: false, kind: "conflict", conflict: pushed.conflict };
		}
		return { ok: true, kind: "pushed", seq: pushed.seq, pushed };
	}
	const remote = { seq: pointer.seq, treeHash: pointer.treeHash };
	const pull = decidePull({
		localTreeHash: local.treeHash,
		localEmpty: local.files.length === 0,
		lastAppliedSeq: state.lastAppliedSeq,
		lastSyncedTreeHash: state.lastSyncedTreeHash,
		remote,
	});
	if (pull.kind === "pull") {
		const pulled = await pullWith(config, false);
		if (pulled.kind === "conflict") return { ok: false, kind: "conflict", conflict: pulled.conflict };
		if (pulled.ok) {
			return pulled.kind === "up_to_date"
				? { ok: true, kind: "up_to_date", seq: pulled.seq }
				: { ok: true, kind: "pulled", seq: pulled.seq, pulled };
		}
	}
	const push = decidePush({
		localTreeHash: local.treeHash,
		lastAppliedSeq: state.lastAppliedSeq,
		lastSyncedTreeHash: state.lastSyncedTreeHash,
		remote,
	});
	if (push.kind === "push") {
		const pushed = await pushWith(config, false);
		if (pushed.kind === "conflict") return { ok: false, kind: "conflict", conflict: pushed.conflict };
		return { ok: true, kind: "pushed", seq: pushed.seq, pushed };
	}
	if (pull.kind === "up_to_date" || push.kind === "up_to_date") {
		clearConflict();
		return { ok: true, kind: "up_to_date", seq: pointer.seq };
	}
	const conflict = pull.kind === "conflict" ? pull.conflict : push.kind === "conflict" ? push.conflict : "remote_diverged";
	recordConflict(conflict);
	return { ok: false, kind: "conflict", conflict: { kind: conflict, remoteSeq: pointer.seq } };
}

export async function pullSync(input: { force?: boolean; confirm?: string } = {}): Promise<PullResult> {
	const config = requireConfig();
	if (input.force && input.confirm !== SYNC_CONFIRM_PULL) {
		throw new SyncServiceError("Force pull requires the confirmation token.", 400, "sync.confirm_required");
	}
	recoverJournal();
	assertIdle();
	return exclusive(() => pullWith(config, input.force === true));
}

async function pullWith(config: SyncConfigRecord, force: boolean): Promise<PullResult> {
	const client = clientFor(config);
	setProgress("scanning");
	const local = scanLocalTree({ force: true });
	const pointer = await readPointer(client);
	if (!pointer) {
		clearConflict();
		return { ok: true, kind: "no_remote" };
	}
	const state = readSyncState();
	const decision: PullDecision = decidePull({
		localTreeHash: local.treeHash,
		localEmpty: local.files.length === 0,
		lastAppliedSeq: state.lastAppliedSeq,
		lastSyncedTreeHash: state.lastSyncedTreeHash,
		remote: { seq: pointer.seq, treeHash: pointer.treeHash },
		force,
	});
	if (decision.kind === "up_to_date") {
		clearConflict();
		updateSyncState({ lastError: null });
		return { ok: true, kind: "up_to_date", seq: decision.seq, treeHash: pointer.treeHash };
	}
	if (decision.kind === "conflict") {
		recordConflict(decision.conflict);
		return { ok: false, kind: "conflict", conflict: { kind: decision.conflict, remoteSeq: decision.remoteSeq } };
	}
	if (decision.kind === "no_remote") return { ok: true, kind: "no_remote" };
	const downloadPath = path.join(PATHS.data, `.sync-download-${randomUUID()}.lhsync`);
	const stagingDir = path.join(PATHS.data, `.sync-staging-${randomUUID()}`);
	let backupDir: string | null = null;
	try {
		setProgress("downloading", 0, pointer.package.size);
		const downloaded = await downloadFile(client, pointer.package.name, downloadPath, MAX_PACKAGE_BYTES, (transferred, total) =>
			setProgress("downloading", transferred, total),
		);
		if (downloaded.size !== pointer.package.size || downloaded.sha256 !== pointer.package.sha256) {
			throw new SyncPackageError("The downloaded package does not match the remote pointer.");
		}
		assertFreeSpace(downloaded.size);
		setProgress("applying");
		const extracted = await extractPackage(downloadPath, stagingDir);
		if (extracted.treeHash !== pointer.treeHash) throw new SyncPackageError("The package tree hash does not match the remote pointer.");
		const applied = applyImport(stagingDir, pointer.treeHash, pointer.seq);
		backupDir = applied.backupDir;
		clearSyncJournal();
		invalidateLocalTreeCache();
		const after = scanLocalTree({ force: true });
		if (after.treeHash !== pointer.treeHash) {
			throw new SyncServiceError("Import verification failed — the local tree still differs from the remote.", 500, "sync.import_verify");
		}
		updateSyncState({
			lastAppliedSeq: pointer.seq,
			lastSyncedTreeHash: pointer.treeHash,
			lastSyncedAt: new Date().toISOString(),
			lastDirection: "pull",
			lastError: null,
			remoteUrl: config.url,
			lastTransfer: {
				direction: "pull",
				bytes: downloaded.size,
				packageName: pointer.package.name,
				at: new Date().toISOString(),
			},
			lastRemote: {
				seq: pointer.seq,
				treeHash: pointer.treeHash,
				packageBytes: pointer.package.size,
				checkedAt: new Date().toISOString(),
			},
		});
		clearConflict();
		emit("sync-changed", {});
		return {
			ok: true,
			kind: "pulled",
			seq: pointer.seq,
			treeHash: pointer.treeHash,
			backupDir,
			imported: { fileCount: after.files.length, totalBytes: after.totalBytes },
			packageBytes: downloaded.size,
		};
	} finally {
		for (const target of [downloadPath, stagingDir]) {
			try {
				fs.rmSync(target, { recursive: true, force: true });
			} catch {
				// Best-effort cleanup.
			}
		}
	}
}

/** Refuse a large import that the disk cannot hold twice over (the download
 *  plus the extracted copy plus the backup). */
function assertFreeSpace(packageBytes: number): void {
	try {
		const stats = fs.statfsSync(PATHS.data);
		const free = stats.bavail * stats.bsize;
		if (free < packageBytes * 3 + 32 * 1024 * 1024) {
			throw new SyncServiceError("Not enough free disk space for the import.", 507, "sync.no_space");
		}
	} catch (error) {
		if (error instanceof SyncServiceError) throw error;
		// statfs unsupported: proceed and let the filesystem refuse.
	}
}

function exists(target: string): boolean {
	try {
		fs.statSync(target);
		return true;
	} catch {
		return false;
	}
}

function backupStamp(): string {
	return new Date().toISOString().replace(/[:.]/g, "-");
}

/** Move the current data aside and the staged tree into place. The backup
 *  stays on disk (`data.bak-<stamp>` beside DATA_ROOT) — a failed import is
 *  recoverable by hand, never auto-rolled-back. */
function applyImport(stagingDir: string, targetTreeHash: string, targetSeq: number): { backupDir: string } {
	const backupDir = path.join(path.dirname(PATHS.data), `data.bak-${backupStamp()}`);
	fs.mkdirSync(backupDir, { recursive: true });
	writeSyncJournal({
		version: 1,
		startedAt: new Date().toISOString(),
		phase: "applying",
		backupDir,
		targetTreeHash,
		targetSeq,
	});
	for (const root of SYNC_DIR_ROOTS) {
		const live = path.join(PATHS.data, root);
		const staged = path.join(stagingDir, root);
		const backed = path.join(backupDir, root);
		if (exists(live)) {
			fs.mkdirSync(path.dirname(backed), { recursive: true });
			fs.renameSync(live, backed);
		}
		if (exists(staged)) {
			fs.mkdirSync(path.dirname(live), { recursive: true });
			fs.renameSync(staged, live);
		} else {
			fs.mkdirSync(live, { recursive: true });
		}
	}
	// Plugin data travels per plugin; plugin CODE (dist, node_modules) never does.
	const livePlugins = path.join(PATHS.data, "plugins");
	const stagedPlugins = path.join(stagingDir, "plugins");
	const pluginIds = new Set<string>();
	for (const base of [livePlugins, stagedPlugins]) {
		let entries: fs.Dirent[] = [];
		try {
			entries = fs.readdirSync(base, { withFileTypes: true });
		} catch {
			entries = [];
		}
		for (const entry of entries) if (entry.isDirectory()) pluginIds.add(entry.name);
	}
	for (const id of pluginIds) {
		if (!/^[A-Za-z0-9._-]+$/.test(id) || id === ".") continue;
		const liveData = path.join(livePlugins, id, "data");
		const stagedData = path.join(stagedPlugins, id, "data");
		const backedData = path.join(backupDir, "plugins", id, "data");
		if (exists(liveData)) {
			fs.mkdirSync(path.dirname(backedData), { recursive: true });
			fs.renameSync(liveData, backedData);
		}
		if (exists(stagedData)) {
			fs.mkdirSync(path.dirname(liveData), { recursive: true });
			fs.renameSync(stagedData, liveData);
		}
	}
	// settings.json: the remote copy has no agent.fileAccess; keep this
	// device's own security choice. Absent in the package = absent locally
	// (the old record stays in the backup).
	const stagedSettings = readStagedSettings(stagingDir);
	const localSettingsPath = path.join(PATHS.data, SYNC_SETTINGS_FILE);
	const backedSettings = path.join(backupDir, SYNC_SETTINGS_FILE);
	if (exists(localSettingsPath)) fs.copyFileSync(localSettingsPath, backedSettings);
	if (stagedSettings !== null) {
		let localSettings: unknown = null;
		try {
			localSettings = JSON.parse(fs.readFileSync(localSettingsPath, "utf8"));
		} catch {
			localSettings = null;
		}
		const merged = mergeSettingsPreservingFileAccess(stagedSettings, localSettings);
		writeFileAtomicSync(localSettingsPath, JSON.stringify(merged, null, "\t"));
	} else {
		try {
			fs.unlinkSync(localSettingsPath);
		} catch {
			// Already absent.
		}
	}
	return { backupDir };
}

/** If a previous import died between the swap and the state write, adopt the
 *  completed swap when the local tree already matches the target; otherwise
 *  leave the journal in place and surface the backup path. */
function recoverJournal(): void {
	const journal = readSyncJournal();
	if (!journal) return;
	let local: LocalTreeSnapshot | null = null;
	try {
		local = scanLocalTree({ force: true });
	} catch {
		local = null;
	}
	if (journal.targetTreeHash && local && local.treeHash === journal.targetTreeHash) {
		updateSyncState({
			lastAppliedSeq: journal.targetSeq ?? readSyncState().lastAppliedSeq,
			lastSyncedTreeHash: journal.targetTreeHash,
			lastSyncedAt: new Date().toISOString(),
			lastDirection: "pull",
			lastError: null,
		});
		clearSyncJournal();
		return;
	}
	updateSyncState({
		lastError: `An interrupted import was found. A backup is at ${journal.backupDir ?? "an unknown location"}.`,
	});
}

/** One automatic check. Never forces; a conflict stops automatic movement
 *  and waits for the user. */
async function autoTick(): Promise<void> {
	const g = runtime();
	g.nextCheckAt = new Date(Date.now() + AUTO_SYNC_INTERVAL_MS).toISOString();
	const config = readSyncConfig();
	if (!config || !config.autoSync) return;
	if (g.running) return;
	if (anyTurnRunning() || hasRunningJobs()) return;
	try {
		recoverJournal();
		await exclusive(() => autoStep(config));
		updateSyncState({ lastError: null });
	} catch (error) {
		updateSyncState({ lastError: brush(error) });
	}
}

async function autoStep(config: SyncConfigRecord): Promise<void> {
	const client = clientFor(config);
	const local = scanLocalTree();
	const pointer = await readPointer(client);
	const state = readSyncState();
	if (!pointer) {
		if (local.files.length === 0) {
			clearConflict();
			return;
		}
		const result = await pushWith(config, false);
		if (result.kind === "conflict") recordConflict(result.conflict?.kind ?? "remote_diverged");
		return;
	}
	const localClean =
		state.lastSyncedTreeHash !== null ? local.treeHash === state.lastSyncedTreeHash : local.files.length === 0;
	if (pointer.seq > state.lastAppliedSeq) {
		if (!localClean) {
			recordConflict("remote_ahead");
			return;
		}
		const result = await pullWith(config, false);
		if (result.kind === "conflict") recordConflict(result.conflict?.kind ?? "remote_diverged");
		return;
	}
	if (pointer.seq < state.lastAppliedSeq) {
		recordConflict("remote_rollback");
		return;
	}
	if (pointer.treeHash !== state.lastSyncedTreeHash) {
		recordConflict("remote_diverged");
		return;
	}
	if (local.treeHash !== state.lastSyncedTreeHash) {
		if (Date.now() - runtime().lastAutoPushAt < AUTO_PUSH_MIN_INTERVAL_MS) return;
		runtime().lastAutoPushAt = Date.now();
		const result = await pushWith(config, false);
		if (result.kind === "conflict") recordConflict(result.conflict?.kind ?? "remote_diverged");
		return;
	}
	clearConflict();
}

/** Start the process-wide automatic loop (idempotent). */
export function startAutoSyncLoop(): void {
	const g = runtime();
	if (g.timer || g.initialTimer) return;
	g.nextCheckAt = new Date(Date.now() + AUTO_SYNC_INITIAL_DELAY_MS).toISOString();
	g.initialTimer = setTimeout(() => {
		g.initialTimer = null;
		void autoTick();
	}, AUTO_SYNC_INITIAL_DELAY_MS);
	g.initialTimer.unref?.();
	g.timer = setInterval(() => void autoTick(), AUTO_SYNC_INTERVAL_MS);
	g.timer.unref?.();
}

/** Test seam: drive one automatic check immediately. */
export async function runAutoSyncOnce(): Promise<void> {
	await autoTick();
}
