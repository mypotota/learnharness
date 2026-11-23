/**
 * The top-bar sync control's pure wording (imported by the control and its
 * test): one status payload → one short label and one tone. The label never
 * claims a sync that did not happen — an unconfigured or never-synced device
 * reads "Not synced", and a conflict/error is surfaced instead of the time.
 */

import type { SyncStatusPayload } from "@/src/core";
import { englishT } from "@/components/i18n/i18n-provider";
import { timeAgo } from "@/components/sidebar";

export type SyncStatusTone = "muted" | "pending" | "ok" | "error";

export function syncStatusLabel(
	status: SyncStatusPayload | null,
	t: typeof englishT = englishT,
	now = new Date(),
): string {
	if (!status) return "";
	if (!status.configured) return t("syncStatus.never");
	if (status.syncing) return t("syncStatus.syncing");
	if (status.conflict) return t("syncStatus.conflict");
	if (status.lastError) return t("syncStatus.issue");
	if (!status.lastSyncedAt) return t("syncStatus.never");
	return timeAgo(status.lastSyncedAt, now, t);
}

export function syncStatusTone(status: SyncStatusPayload | null): SyncStatusTone {
	if (!status) return "muted";
	if (status.syncing) return "pending";
	if (status.conflict || status.lastError) return "error";
	if (!status.configured || !status.lastSyncedAt) return "muted";
	return "ok";
}
