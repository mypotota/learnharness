/**
 * Local sync records (webdav-sync wave, 2026-11-21): the config/state/
 * journal trio beside auth.json. All three are LOCAL-ONLY (never inside
 * DATA_ROOT, so they never enter a package) and 0600 — sync-config.json
 * carries the Basic-auth password in plaintext by the owner's explicit
 * decision (IP + HTTP deployment).
 *
 * Reads are tolerant: a missing/corrupt file resolves to null/defaults,
 * never throws (the Settings card must still render). Writes are atomic
 * through the store's shared writeFileAtomicSync law.
 */

import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { SYNC_CONFIG_FILE, SYNC_JOURNAL_FILE, SYNC_STATE_FILE } from "../../../config.ts";
import type { SyncConfigRecord, SyncStateRecord } from "../../core/sync.ts";
import { writeFileAtomicSync } from "../../store/atomic-write.ts";

export interface SyncJournalRecord {
	version: 1;
	startedAt: string;
	phase: string;
	backupDir: string | null;
	targetTreeHash: string | null;
	targetSeq: number | null;
}

function readJsonObject(file: string): Record<string, unknown> | null {
	try {
		const parsed: unknown = JSON.parse(fs.readFileSync(file, "utf8"));
		if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
		return parsed as Record<string, unknown>;
	} catch {
		return null;
	}
}

function writeJson(file: string, value: unknown): void {
	fs.mkdirSync(path.dirname(file), { recursive: true });
	writeFileAtomicSync(file, JSON.stringify(value, null, "\t"), { mode: 0o600 });
}

function removeJson(file: string): void {
	try {
		fs.unlinkSync(file);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
	}
}

function nonEmptyString(value: unknown): string | null {
	return typeof value === "string" && value.length > 0 ? value : null;
}

export function readSyncConfig(): SyncConfigRecord | null {
	const raw = readJsonObject(SYNC_CONFIG_FILE);
	if (!raw) return null;
	const url = nonEmptyString(raw.url);
	const username = nonEmptyString(raw.username);
	if (!url || !username) return null;
	return {
		version: 1,
		url,
		username,
		password: typeof raw.password === "string" ? raw.password : "",
		autoSync: raw.autoSync !== false,
	};
}

export function writeSyncConfig(record: SyncConfigRecord): void {
	writeJson(SYNC_CONFIG_FILE, record);
}

export function clearSyncConfig(): void {
	removeJson(SYNC_CONFIG_FILE);
}

const DEFAULT_STATE = (): SyncStateRecord => ({
	version: 1,
	deviceId: `dev_${randomUUID()}`,
	remoteUrl: null,
	lastAppliedSeq: 0,
	lastSyncedTreeHash: null,
	lastSyncedAt: null,
	lastDirection: null,
	lastError: null,
	lastRemote: null,
	lastTransfer: null,
	recentPackages: [],
});

export function readSyncState(): SyncStateRecord {
	const raw = readJsonObject(SYNC_STATE_FILE);
	if (!raw) {
		// Persist the generated identity immediately: a fresh process must not
		// mint a new deviceId on every read before the first operation.
		const created = DEFAULT_STATE();
		writeSyncState(created);
		return created;
	}
	const direction = raw.lastDirection === "push" || raw.lastDirection === "pull" ? raw.lastDirection : null;
	const remote =
		raw.lastRemote && typeof raw.lastRemote === "object" && !Array.isArray(raw.lastRemote)
			? (raw.lastRemote as Record<string, unknown>)
			: null;
	const transfer =
		raw.lastTransfer && typeof raw.lastTransfer === "object" && !Array.isArray(raw.lastTransfer)
			? (raw.lastTransfer as Record<string, unknown>)
			: null;
	return {
		version: 1,
		deviceId: nonEmptyString(raw.deviceId) ?? `dev_${randomUUID()}`,
		remoteUrl: nonEmptyString(raw.remoteUrl),
		lastAppliedSeq: typeof raw.lastAppliedSeq === "number" && Number.isFinite(raw.lastAppliedSeq) ? raw.lastAppliedSeq : 0,
		lastSyncedTreeHash: nonEmptyString(raw.lastSyncedTreeHash),
		lastSyncedAt: nonEmptyString(raw.lastSyncedAt),
		lastDirection: direction,
		lastError: nonEmptyString(raw.lastError),
		lastRemote:
			remote && typeof remote.seq === "number" && typeof remote.treeHash === "string"
				? {
						seq: remote.seq,
						treeHash: remote.treeHash,
						packageBytes: typeof remote.packageBytes === "number" ? remote.packageBytes : 0,
						checkedAt: nonEmptyString(remote.checkedAt) ?? new Date().toISOString(),
					}
				: null,
		lastTransfer:
			transfer && (transfer.direction === "push" || transfer.direction === "pull") && typeof transfer.bytes === "number"
				? {
						direction: transfer.direction,
						bytes: transfer.bytes,
						packageName: nonEmptyString(transfer.packageName) ?? "",
						at: nonEmptyString(transfer.at) ?? new Date().toISOString(),
					}
				: null,
		recentPackages: Array.isArray(raw.recentPackages)
			? raw.recentPackages.filter((name): name is string => typeof name === "string").slice(-10)
			: [],
	};
}

export function writeSyncState(record: SyncStateRecord): void {
	writeJson(SYNC_STATE_FILE, record);
}

export function updateSyncState(patch: Partial<SyncStateRecord>): SyncStateRecord {
	const next = { ...readSyncState(), ...patch, version: 1 as const };
	writeSyncState(next);
	return next;
}

export function readSyncJournal(): SyncJournalRecord | null {
	const raw = readJsonObject(SYNC_JOURNAL_FILE);
	if (!raw) return null;
	return {
		version: 1,
		startedAt: nonEmptyString(raw.startedAt) ?? new Date().toISOString(),
		phase: nonEmptyString(raw.phase) ?? "unknown",
		backupDir: nonEmptyString(raw.backupDir),
		targetTreeHash: nonEmptyString(raw.targetTreeHash),
		targetSeq: typeof raw.targetSeq === "number" ? raw.targetSeq : null,
	};
}

export function writeSyncJournal(record: SyncJournalRecord): void {
	writeJson(SYNC_JOURNAL_FILE, record);
}

export function clearSyncJournal(): void {
	removeJson(SYNC_JOURNAL_FILE);
}

/** Keep `deviceId` stable from the first read even if no operation has
 *  written state yet: a package must carry a durable identity. */
export function ensureSyncState(): SyncStateRecord {
	const state = readSyncState();
	writeSyncState(state);
	return state;
}
