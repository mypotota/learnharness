import assert from "node:assert/strict";
import test from "node:test";
import { syncStatusLabel, syncStatusTone } from "../components/sync-status-label.ts";
import type { SyncStatusPayload } from "../src/core/index.ts";

function status(overrides: Partial<SyncStatusPayload> = {}): SyncStatusPayload {
	return {
		configured: true,
		autoSync: true,
		url: "http://example.test/lh-sync/",
		username: "owner",
		deviceId: "device-1",
		busy: false,
		busyReason: null,
		syncing: false,
		progress: null,
		local: null,
		remote: null,
		lastAppliedSeq: 0,
		lastSyncedTreeHash: null,
		lastSyncedAt: null,
		lastDirection: null,
		lastError: null,
		lastTransfer: null,
		conflict: null,
		insecureHttp: true,
		nextCheckAt: null,
		...overrides,
	};
}

test("sync label: an unconfigured or never-synced device never claims a sync", () => {
	assert.equal(syncStatusLabel(null), "");
	assert.equal(syncStatusLabel(status({ configured: false })), "Not synced");
	assert.equal(syncStatusLabel(status()), "Not synced");
});

test("sync label: the last sync time is relative to the viewer's clock", () => {
	const now = new Date("2026-11-23T12:00:00Z");
	assert.equal(
		syncStatusLabel(status({ lastSyncedAt: "2026-11-23T11:59:40Z" }), undefined, now),
		"just now",
	);
	assert.equal(
		syncStatusLabel(status({ lastSyncedAt: "2026-11-23T10:00:00Z" }), undefined, now),
		"2h ago",
	);
});

test("sync label: running, conflict and error states win over the timestamp", () => {
	assert.equal(syncStatusLabel(status({ syncing: true, lastSyncedAt: "2026-11-23T11:00:00Z" })), "Syncing…");
	assert.equal(
		syncStatusLabel(status({ conflict: { kind: "remote_ahead" }, lastSyncedAt: "2026-11-23T11:00:00Z" })),
		"Needs attention",
	);
	assert.equal(syncStatusLabel(status({ lastError: "boom", lastSyncedAt: "2026-11-23T11:00:00Z" })), "Sync issue");
});

test("sync tone: pending and error states are visually distinct from a healthy sync", () => {
	assert.equal(syncStatusTone(null), "muted");
	assert.equal(syncStatusTone(status({ syncing: true })), "pending");
	assert.equal(syncStatusTone(status({ conflict: { kind: "local_changed" } })), "error");
	assert.equal(syncStatusTone(status({ lastSyncedAt: "2026-11-23T11:00:00Z" })), "ok");
});
