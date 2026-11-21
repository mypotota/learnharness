/**
 * The local tree (webdav-sync wave, 2026-11-21): which files travel, their
 * sha256, and the single tree hash two devices compare.
 *
 * The cache is globalThis-backed (Next dev compiles each route as its own
 * entry — a module-level map would be a different map per route) and keyed
 * by path + size + mtime, so a re-scan stats every file but only re-hashes
 * the ones that changed. That keeps the 60-second auto check cheap.
 */

import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { PATHS } from "../../../config.ts";
import {
	SYNC_DIR_ROOTS,
	SYNC_SETTINGS_FILE,
	canonicalJson,
	isSafeSyncPath,
	projectSettingsForSync,
	type SyncFileEntry,
} from "../../core/sync.ts";
import { CURRENT_CHAT_VERSION } from "../../core/contracts/chat.ts";
import { CURRENT_GRAPH_FORMAT_VERSION } from "../../core/contracts/graph.ts";
import { CURRENT_SETTINGS_VERSION } from "../../core/settings.ts";

export interface LocalTreeSnapshot {
	files: SyncFileEntry[];
	treeHash: string;
	totalBytes: number;
	scannedAt: string;
}

interface HashCacheEntry {
	size: number;
	mtimeMs: number;
	sha256: string;
}

interface TreeGlobal {
	__lhSyncTreeCache?: { at: number; snapshot: LocalTreeSnapshot };
	__lhSyncHashCache?: Map<string, HashCacheEntry>;
}

const SNAPSHOT_TTL_MS = 10_000;

function treeGlobal(): TreeGlobal {
	return globalThis as typeof globalThis & TreeGlobal;
}

function hashCache(): Map<string, HashCacheEntry> {
	const g = treeGlobal();
	return (g.__lhSyncHashCache ??= new Map());
}

function sha256Hex(data: Buffer | string): string {
	return createHash("sha256").update(data).digest("hex");
}

function hashFile(abs: string): string {
	const hash = createHash("sha256");
	const fd = fs.openSync(abs, "r");
	const buffer = Buffer.allocUnsafe(1024 * 1024);
	try {
		for (;;) {
			const read = fs.readSync(fd, buffer, 0, buffer.length, null);
			if (read <= 0) break;
			hash.update(buffer.subarray(0, read));
		}
	} finally {
		fs.closeSync(fd);
	}
	return hash.digest("hex");
}

export function computeTreeHash(files: readonly SyncFileEntry[]): string {
	const normalized = files
		.map((file) => ({ path: file.path, size: file.size, sha256: file.sha256 }))
		.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
	return sha256Hex(canonicalJson(normalized));
}

/** The exact bytes a package carries for settings.json (agent.fileAccess
 *  removed). Falls back to the raw file when it is not valid JSON, so an
 *  already-broken record is still transferred verbatim. */
export function projectedSettingsBytes(): Buffer | null {
	let raw: string;
	try {
		raw = fs.readFileSync(path.join(/* turbopackIgnore: true */ PATHS.data, SYNC_SETTINGS_FILE), "utf8");
	} catch {
		return null;
	}
	try {
		const parsed: unknown = JSON.parse(raw);
		return Buffer.from(`${JSON.stringify(projectSettingsForSync(parsed), null, "\t")}\n`, "utf8");
	} catch {
		return Buffer.from(raw, "utf8");
	}
}

function collectFiles(absDir: string, relDir: string, out: Array<{ rel: string; abs: string; size: number; mtimeMs: number }>): void {
	let entries: fs.Dirent[];
	try {
		entries = fs.readdirSync(absDir, { withFileTypes: true });
	} catch {
		return;
	}
	for (const entry of entries) {
		const abs = path.join(absDir, entry.name);
		const rel = `${relDir}/${entry.name}`;
		if (entry.isSymbolicLink()) continue;
		if (entry.isDirectory()) {
			collectFiles(abs, rel, out);
			continue;
		}
		if (!entry.isFile()) continue;
		if (!isSafeSyncPath(rel)) continue;
		try {
			const stat = fs.statSync(abs);
			out.push({ rel, abs, size: stat.size, mtimeMs: stat.mtimeMs });
		} catch {
			// Vanished mid-scan: the next scan picks it up.
		}
	}
}

function listedSources(): Array<{ rel: string; abs: string; size: number; mtimeMs: number }> {
	const out: Array<{ rel: string; abs: string; size: number; mtimeMs: number }> = [];
	for (const root of SYNC_DIR_ROOTS) {
		collectFiles(path.join(/* turbopackIgnore: true */ PATHS.data, root), root, out);
	}
	const pluginsDir = path.join(/* turbopackIgnore: true */ PATHS.data, "plugins");
	let pluginIds: fs.Dirent[] = [];
	try {
		pluginIds = fs.readdirSync(pluginsDir, { withFileTypes: true });
	} catch {
		pluginIds = [];
	}
	for (const entry of pluginIds) {
		if (!entry.isDirectory()) continue;
		if (!/^[A-Za-z0-9._-]+$/.test(entry.name) || entry.name === ".") continue;
		collectFiles(path.join(/* turbopackIgnore: true */ pluginsDir, entry.name, "data"), `plugins/${entry.name}/data`, out);
	}
	const settingsAbs = path.join(/* turbopackIgnore: true */ PATHS.data, SYNC_SETTINGS_FILE);
	try {
		const stat = fs.statSync(settingsAbs);
		if (stat.isFile()) out.push({ rel: SYNC_SETTINGS_FILE, abs: settingsAbs, size: stat.size, mtimeMs: stat.mtimeMs });
	} catch {
		// No settings record yet.
	}
	return out;
}

/** Scan the whitelisted roots into a manifest table + tree hash. */
export function scanLocalTree(options?: { force?: boolean }): LocalTreeSnapshot {
	const g = treeGlobal();
	if (!options?.force) {
		const cached = g.__lhSyncTreeCache;
		if (cached && Date.now() - cached.at < SNAPSHOT_TTL_MS) return cached.snapshot;
	}
	const cache = hashCache();
	const seen = new Set<string>();
	const files: SyncFileEntry[] = [];
	let totalBytes = 0;
	for (const source of listedSources()) {
		if (seen.has(source.rel)) continue;
		seen.add(source.rel);
		let size = source.size;
		let sha256: string;
		if (source.rel === SYNC_SETTINGS_FILE) {
			const projected = projectedSettingsBytes();
			if (projected) {
				size = projected.length;
				sha256 = sha256Hex(projected);
			} else {
				sha256 = hashFile(source.abs);
			}
		} else {
			const cached = cache.get(source.rel);
			if (cached && cached.size === source.size && cached.mtimeMs === source.mtimeMs) {
				sha256 = cached.sha256;
			} else {
				try {
					sha256 = hashFile(source.abs);
				} catch {
					continue;
				}
				cache.set(source.rel, { size: source.size, mtimeMs: source.mtimeMs, sha256 });
			}
		}
		files.push({ path: source.rel, size, sha256 });
		totalBytes += size;
	}
	// Drop cache entries for files that no longer exist.
	for (const key of cache.keys()) if (!seen.has(key)) cache.delete(key);
	const snapshot: LocalTreeSnapshot = {
		files,
		treeHash: computeTreeHash(files),
		totalBytes,
		scannedAt: new Date().toISOString(),
	};
	g.__lhSyncTreeCache = { at: Date.now(), snapshot };
	return snapshot;
}

export function invalidateLocalTreeCache(): void {
	const g = treeGlobal();
	delete g.__lhSyncTreeCache;
}

export function currentDataVersions(): { chatVersion: number; graphFormatVersion: number; settingsVersion: number } {
	return {
		chatVersion: CURRENT_CHAT_VERSION,
		graphFormatVersion: CURRENT_GRAPH_FORMAT_VERSION,
		settingsVersion: CURRENT_SETTINGS_VERSION,
	};
}
