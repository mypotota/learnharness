/**
 * WebDAV sync (webdav-sync wave, 2026-11-21): the pure conflict protocol,
 * path safety, settings projection, and a real tar.gz round trip through
 * the package builder/extractor.
 *
 * The archive test sets LH_DATA_DIR BEFORE importing config.ts (which reads
 * it at module load) — node --test runs each file in its own process, so
 * the exported PATHS point at the temp directory for this file only.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
	SYNC_CONFIRM_PULL,
	SYNC_CONFIRM_PUSH,
	decidePull,
	decidePush,
	isSafeSyncPath,
	isInsecureHttp,
	mergeSettingsPreservingFileAccess,
	normalizeSyncUrl,
	projectSettingsForSync,
} from "../src/core/sync.ts";

const TREE_A = "a".repeat(64);
const TREE_B = "b".repeat(64);

test("normalizeSyncUrl accepts http(s) and forces one trailing slash", () => {
	assert.equal(normalizeSyncUrl("http://1.2.3.4:21050/lh-sync"), "http://1.2.3.4:21050/lh-sync/");
	assert.equal(normalizeSyncUrl(" https://example.com/a/ "), "https://example.com/a/");
	assert.equal(normalizeSyncUrl("ftp://example.com"), null);
	assert.equal(normalizeSyncUrl("not a url"), null);
	assert.equal(normalizeSyncUrl("http://example.com/?a=1"), null);
	assert.equal(normalizeSyncUrl("http://user:pass@example.com/"), null);
	assert.equal(isInsecureHttp("http://1.2.3.4/"), true);
	assert.equal(isInsecureHttp("https://example.com/"), false);
});

test("isSafeSyncPath only admits the whitelisted roots", () => {
	assert.equal(isSafeSyncPath("chats/abc.json"), true);
	assert.equal(isSafeSyncPath("graph/nodes.jsonl"), true);
	assert.equal(isSafeSyncPath("settings.json"), true);
	assert.equal(isSafeSyncPath("plugins/foo/data/state.json"), true);

	assert.equal(isSafeSyncPath("jobs/1.json"), false);
	assert.equal(isSafeSyncPath("debug/x.jsonl"), false);
	assert.equal(isSafeSyncPath("auth.json"), false);
	assert.equal(isSafeSyncPath("plugins/foo/dist/index.js"), false);
	assert.equal(isSafeSyncPath("../chats/x.json"), false);
	assert.equal(isSafeSyncPath("chats/../../auth.json"), false);
	assert.equal(isSafeSyncPath("/etc/passwd"), false);
	assert.equal(isSafeSyncPath("C:/Windows/x"), false);
	assert.equal(isSafeSyncPath("chats\\x.json"), false);
	assert.equal(isSafeSyncPath(""), false);
});

test("decidePush never overwrites an advanced remote without force", () => {
	const base = { localTreeHash: TREE_B, lastAppliedSeq: 2, lastSyncedTreeHash: TREE_A, remote: { seq: 3, treeHash: TREE_B } };
	const blocked = decidePush(base);
	assert.equal(blocked.kind, "conflict");
	if (blocked.kind === "conflict") assert.equal(blocked.conflict, "remote_ahead");

	const forced = decidePush({ ...base, force: true });
	assert.deepEqual(forced, { kind: "push", seq: 4 });
});

test("decidePush uploads local changes when the remote is unchanged", () => {
	assert.deepEqual(
		decidePush({ localTreeHash: TREE_B, lastAppliedSeq: 2, lastSyncedTreeHash: TREE_A, remote: { seq: 2, treeHash: TREE_A } }),
		{ kind: "push", seq: 3 },
	);
	assert.deepEqual(
		decidePush({ localTreeHash: TREE_A, lastAppliedSeq: 2, lastSyncedTreeHash: TREE_A, remote: { seq: 2, treeHash: TREE_A } }),
		{ kind: "up_to_date", seq: 2 },
	);
	assert.deepEqual(
		decidePush({ localTreeHash: TREE_B, lastAppliedSeq: 0, lastSyncedTreeHash: null, remote: null }),
		{ kind: "push", seq: 1 },
	);
});

test("decidePull refuses a dirty device and admits a clean or empty one", () => {
	assert.deepEqual(
		decidePull({
			localTreeHash: TREE_A,
			localEmpty: false,
			lastAppliedSeq: 1,
			lastSyncedTreeHash: TREE_A,
			remote: { seq: 2, treeHash: TREE_B },
		}),
		{ kind: "pull", seq: 2 },
	);
	const dirty = decidePull({
		localTreeHash: TREE_B,
		localEmpty: false,
		lastAppliedSeq: 1,
		lastSyncedTreeHash: TREE_A,
		remote: { seq: 2, treeHash: TREE_A },
	});
	assert.equal(dirty.kind, "conflict");
	if (dirty.kind === "conflict") assert.equal(dirty.conflict, "local_changed");

	const firstBoot = decidePull({
		localTreeHash: TREE_B,
		localEmpty: true,
		lastAppliedSeq: 0,
		lastSyncedTreeHash: null,
		remote: { seq: 1, treeHash: TREE_A },
	});
	assert.deepEqual(firstBoot, { kind: "pull", seq: 1 });

	assert.deepEqual(
		decidePull({ localTreeHash: TREE_A, localEmpty: false, lastAppliedSeq: 2, lastSyncedTreeHash: TREE_A, remote: { seq: 2, treeHash: TREE_A } }),
		{ kind: "up_to_date", seq: 2 },
	);
	assert.equal(
		decidePull({ localTreeHash: TREE_A, localEmpty: false, lastAppliedSeq: 2, lastSyncedTreeHash: TREE_A, remote: null }).kind,
		"no_remote",
	);
});

test("settings projection drops agent.fileAccess and re-merge restores the local value", () => {
	const remote = projectSettingsForSync({ version: 1, agent: { fileAccess: "/Users/me/course", model: "x" }, general: { locale: "zh-CN" } });
	assert.deepEqual(remote, { version: 1, agent: { model: "x" }, general: { locale: "zh-CN" } });
	const merged = mergeSettingsPreservingFileAccess(remote, { agent: { fileAccess: "/data/local" } });
	assert.deepEqual(merged, { version: 1, agent: { model: "x", fileAccess: "/data/local" }, general: { locale: "zh-CN" } });
});

test("a package round-trips with the same tree hash and no local secrets", async () => {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "lh-sync-test-"));
	const dataDir = path.join(root, "data");
	fs.mkdirSync(path.join(dataDir, "chats"), { recursive: true });
	fs.mkdirSync(path.join(dataDir, "graph"), { recursive: true });
	fs.mkdirSync(path.join(dataDir, "plugins", "demo", "data"), { recursive: true });
	fs.mkdirSync(path.join(dataDir, "plugins", "demo", "dist"), { recursive: true });
	fs.writeFileSync(path.join(dataDir, "chats", "c1.json"), JSON.stringify({ id: "c1" }));
	fs.writeFileSync(path.join(dataDir, "graph", "nodes.jsonl"), '{"id":"n1"}\n');
	fs.writeFileSync(path.join(dataDir, "plugins", "demo", "data", "state.json"), '{"ok":true}');
	fs.writeFileSync(path.join(dataDir, "plugins", "demo", "dist", "index.js"), "// never travels");
	fs.writeFileSync(
		path.join(dataDir, "settings.json"),
		JSON.stringify({ version: 1, agent: { fileAccess: "/secret/local", model: "m" }, general: { locale: "zh-CN" } }, null, "\t"),
	);
	process.env.LH_DATA_DIR = dataDir;
	process.env.LH_AUTH_FILE = path.join(root, "auth.json");

	const { scanLocalTree } = await import("../src/server/sync/tree.ts");
	const { buildPackage, extractPackage } = await import("../src/server/sync/archive.ts");

	const snapshot = scanLocalTree({ force: true });
	assert.deepEqual(snapshot.files.map((file) => file.path).sort(), [
		"chats/c1.json",
		"graph/nodes.jsonl",
		"plugins/demo/data/state.json",
		"settings.json",
	]);
	assert.equal(snapshot.files.find((file) => file.path === "settings.json")?.size, Buffer.byteLength(`${JSON.stringify({ version: 1, agent: { model: "m" }, general: { locale: "zh-CN" } }, null, "\t")}\n`));

	const built = await buildPackage({ snapshot, seq: 1, deviceId: "dev_test", appVersion: "test" });
	try {
		assert.ok(built.size > 0);
		assert.match(built.sha256, /^[0-9a-f]{64}$/);
		const dest = path.join(root, "extracted");
		const extracted = await extractPackage(built.filePath, dest);
		assert.equal(extracted.treeHash, snapshot.treeHash);
		assert.equal(extracted.manifest.seq, 1);
		const settings = JSON.parse(fs.readFileSync(path.join(dest, "settings.json"), "utf8")) as Record<string, unknown>;
		assert.equal((settings.agent as Record<string, unknown>).fileAccess, undefined);
		assert.equal(fs.existsSync(path.join(dest, "plugins", "demo", "dist", "index.js")), false);
		assert.equal(fs.existsSync(path.join(dest, "auth.json")), false);
	} finally {
		built.cleanup();
		fs.rmSync(root, { recursive: true, force: true });
	}
});

test("the confirmation tokens are the documented strings", () => {
	assert.equal(SYNC_CONFIRM_PUSH, "overwrite-remote");
	assert.equal(SYNC_CONFIRM_PULL, "replace-local");
});
