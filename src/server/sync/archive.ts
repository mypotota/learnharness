/**
 * The .lhsync package (webdav-sync wave, 2026-11-21): gzip + tar with a
 * manifest.json table of contents.
 *
 * Build stages hard links (falling back to copies across filesystems) and
 * writes the one projected file — settings.json without agent.fileAccess —
 * so the archive carries exactly the bytes the manifest hashes.
 *
 * Import is hostile-input shaped: every tar header is inspected before a
 * single byte is extracted (no absolute paths, no `..`, no links/devices,
 * no duplicates), size/count limits are enforced, and every file is
 * re-hashed against the manifest after extraction. The caller owns the
 * staging directory and the swap into DATA_ROOT.
 */

import fs from "node:fs";
import path from "node:path";
import { randomUUID, createHash } from "node:crypto";
import * as tar from "tar";
import { PATHS } from "../../../config.ts";
import {
	MAX_EXTRACTED_BYTES,
	MAX_PACKAGE_FILES,
	SYNC_FORMAT_VERSION,
	SYNC_SETTINGS_FILE,
	isSafeSyncPath,
	projectSettingsForSync,
	type SyncFileEntry,
	type SyncManifest,
} from "../../core/sync.ts";
import { computeTreeHash, currentDataVersions, projectedSettingsBytes, type LocalTreeSnapshot } from "./tree.ts";

const MANIFEST_NAME = "manifest.json";

export interface BuiltPackage {
	filePath: string;
	stagingDir: string;
	size: number;
	sha256: string;
	manifest: SyncManifest;
	cleanup: () => void;
}

function hashFileSync(file: string): string {
	const hash = createHash("sha256");
	const fd = fs.openSync(file, "r");
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

function stageFile(sourceAbs: string, destAbs: string): void {
	fs.mkdirSync(path.dirname(destAbs), { recursive: true });
	try {
		fs.linkSync(sourceAbs, destAbs);
	} catch {
		fs.copyFileSync(sourceAbs, destAbs);
	}
}

export async function buildPackage(input: {
	snapshot: LocalTreeSnapshot;
	seq: number;
	deviceId: string;
	appVersion: string;
}): Promise<BuiltPackage> {
	const stagingDir = path.join(PATHS.data, `.sync-staging-${randomUUID()}`);
	fs.mkdirSync(stagingDir, { recursive: true });
	const cleanup = () => {
		try {
			fs.rmSync(stagingDir, { recursive: true, force: true });
		} catch {
			// Leftovers are harmless; the next run makes a new directory.
		}
	};
	try {
		const projectedSettings = projectedSettingsBytes();
		for (const file of input.snapshot.files) {
			const dest = path.join(stagingDir, file.path);
			if (file.path === SYNC_SETTINGS_FILE && projectedSettings) {
				fs.mkdirSync(path.dirname(dest), { recursive: true });
				fs.writeFileSync(dest, projectedSettings);
				continue;
			}
			stageFile(path.join(PATHS.data, file.path), dest);
		}
		const manifest: SyncManifest = {
			formatVersion: SYNC_FORMAT_VERSION,
			appVersion: input.appVersion,
			deviceId: input.deviceId,
			seq: input.seq,
			createdAt: new Date().toISOString(),
			treeHash: input.snapshot.treeHash,
			data: currentDataVersions(),
			files: input.snapshot.files,
		};
		fs.writeFileSync(path.join(stagingDir, MANIFEST_NAME), `${JSON.stringify(manifest, null, "\t")}\n`);
		const filePath = path.join(stagingDir, `learnharness-${input.seq}-${input.snapshot.treeHash.slice(0, 12)}.lhsync`);
		const entries = [...input.snapshot.files.map((file) => file.path), MANIFEST_NAME];
		await tar.c({ gzip: true, file: filePath, cwd: stagingDir, portable: true, noDirRecurse: true }, entries);
		const stat = fs.statSync(filePath);
		const sha256 = hashFileSync(filePath);
		return { filePath, stagingDir, size: stat.size, sha256, manifest, cleanup };
	} catch (error) {
		cleanup();
		throw error;
	}
}

interface TarEntryInfo {
	path: string;
	type: string;
	size: number;
}

/** Read every header without extracting; reject anything that could escape
 *  the staging directory or exhaust the disk. */
async function inspectPackage(packagePath: string): Promise<{ files: Set<string>; totalBytes: number }> {
	const entries: TarEntryInfo[] = [];
	await tar.t({
		file: packagePath,
		onentry: (entry) => {
			const type = String(entry.type);
			const size = typeof entry.size === "number" ? entry.size : 0;
			entries.push({ path: entry.path, type, size });
		},
	});
	const files = new Set<string>();
	let totalBytes = 0;
	let fileCount = 0;
	for (const entry of entries) {
		const name = entry.type === "Directory" && entry.path.endsWith("/") ? entry.path.slice(0, -1) : entry.path;
		if (entry.type !== "File" && entry.type !== "Directory") {
			throw new SyncPackageError(`unsupported tar entry type: ${entry.type}`);
		}
		if (name !== MANIFEST_NAME && !isSafeSyncPath(name)) {
			throw new SyncPackageError(`unsafe package path: ${name}`);
		}
		if (entry.type === "Directory") continue;
		if (files.has(name)) throw new SyncPackageError(`duplicate package path: ${name}`);
		files.add(name);
		fileCount += 1;
		totalBytes += entry.size;
		if (fileCount > MAX_PACKAGE_FILES) throw new SyncPackageError("too many files in package");
		if (totalBytes > MAX_EXTRACTED_BYTES) throw new SyncPackageError("package expands beyond the size limit");
	}
	if (!files.has(MANIFEST_NAME)) throw new SyncPackageError("package has no manifest.json");
	return { files, totalBytes };
}

export class SyncPackageError extends Error {}

function parseManifest(raw: string): SyncManifest {
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		throw new SyncPackageError("manifest is not valid JSON");
	}
	if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new SyncPackageError("manifest has the wrong shape");
	const record = parsed as Record<string, unknown>;
	const files = record.files;
	if (
		record.formatVersion !== SYNC_FORMAT_VERSION ||
		typeof record.treeHash !== "string" ||
		typeof record.seq !== "number" ||
		typeof record.deviceId !== "string" ||
		typeof record.createdAt !== "string" ||
		typeof record.appVersion !== "string" ||
		!Array.isArray(files)
	) {
		throw new SyncPackageError("manifest fields are missing or unsupported");
	}
	const data = record.data;
	if (!data || typeof data !== "object" || Array.isArray(data)) throw new SyncPackageError("manifest data stamps are missing");
	const stamps = data as Record<string, unknown>;
	const entries: SyncFileEntry[] = [];
	for (const item of files) {
		if (!item || typeof item !== "object" || Array.isArray(item)) throw new SyncPackageError("manifest file entry is malformed");
		const file = item as Record<string, unknown>;
		if (
			typeof file.path !== "string" ||
			typeof file.size !== "number" ||
			typeof file.sha256 !== "string" ||
			!/^[0-9a-f]{64}$/.test(file.sha256) ||
			!isSafeSyncPath(file.path)
		) {
			throw new SyncPackageError("manifest file entry is malformed");
		}
		entries.push({ path: file.path, size: file.size, sha256: file.sha256 });
	}
	return {
		formatVersion: SYNC_FORMAT_VERSION,
		appVersion: record.appVersion,
		deviceId: record.deviceId,
		seq: record.seq,
		createdAt: record.createdAt,
		treeHash: record.treeHash,
		data: {
			chatVersion: typeof stamps.chatVersion === "number" ? stamps.chatVersion : 0,
			graphFormatVersion: typeof stamps.graphFormatVersion === "number" ? stamps.graphFormatVersion : 0,
			settingsVersion: typeof stamps.settingsVersion === "number" ? stamps.settingsVersion : 0,
		},
		files: entries,
	};
}

/** Refuse a package written by a NEWER record schema — this build could not
 *  read what it would import. */
export function assertCompatible(manifest: SyncManifest): void {
	const current = currentDataVersions();
	if (manifest.data.chatVersion > current.chatVersion) throw new SyncPackageError("package was written by a newer chat schema");
	if (manifest.data.graphFormatVersion > current.graphFormatVersion) throw new SyncPackageError("package was written by a newer graph schema");
	if (manifest.data.settingsVersion > current.settingsVersion) throw new SyncPackageError("package was written by a newer settings schema");
}

export interface ExtractedPackage {
	manifest: SyncManifest;
	treeHash: string;
}

export async function extractPackage(packagePath: string, destDir: string): Promise<ExtractedPackage> {
	await inspectPackage(packagePath);
	fs.mkdirSync(destDir, { recursive: true });
	await tar.x({
		file: packagePath,
		cwd: destDir,
		strict: true,
		preservePaths: false,
		filter: (entryPath) => {
			const name = entryPath.replace(/\/$/, "");
			return name === MANIFEST_NAME || isSafeSyncPath(name);
		},
	});
	const manifest = parseManifest(fs.readFileSync(path.join(destDir, MANIFEST_NAME), "utf8"));
	assertCompatible(manifest);
	for (const file of manifest.files) {
		const abs = path.join(destDir, file.path);
		let stat: fs.Stats;
		try {
			stat = fs.statSync(abs);
		} catch {
			throw new SyncPackageError(`package is missing ${file.path}`);
		}
		if (!stat.isFile()) throw new SyncPackageError(`package entry is not a file: ${file.path}`);
		if (stat.size !== file.size) throw new SyncPackageError(`size mismatch for ${file.path}`);
		if (hashFileSync(abs) !== file.sha256) throw new SyncPackageError(`checksum mismatch for ${file.path}`);
	}
	// Files outside the manifest are refused too: a hostile archive must not
	// smuggle extra records into the staging directory.
	const manifestPaths = new Set(manifest.files.map((file) => file.path));
	for (const found of listStagedFiles(destDir)) {
		if (!manifestPaths.has(found) && found !== MANIFEST_NAME) {
			throw new SyncPackageError(`package contains an unlisted file: ${found}`);
		}
	}
	const treeHash = computeTreeHash(manifest.files);
	if (treeHash !== manifest.treeHash) throw new SyncPackageError("package tree hash does not match its manifest");
	return { manifest, treeHash };
}

function listStagedFiles(root: string, prefix = ""): string[] {
	const out: string[] = [];
	let entries: fs.Dirent[];
	try {
		entries = fs.readdirSync(path.join(root, prefix), { withFileTypes: true });
	} catch {
		return out;
	}
	for (const entry of entries) {
		const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
		if (entry.isDirectory()) out.push(...listStagedFiles(root, rel));
		else if (entry.isFile()) out.push(rel);
	}
	return out;
}

/** Read the staged settings record as JSON (null when absent/unreadable). */
export function readStagedSettings(stagingDir: string): unknown {
	try {
		return JSON.parse(fs.readFileSync(path.join(stagingDir, SYNC_SETTINGS_FILE), "utf8"));
	} catch {
		return null;
	}
}

export { projectSettingsForSync };
