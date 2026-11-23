"use client";

/**
 * THE TOP-BAR SYNC CONTROL: the last-sync time, one tap to sync, and the
 * conflict exit. Present on every content-page top bar.
 *
 * - Unconfigured → the control opens Settings → Sync (nothing to sync yet).
 * - Configured → a tap POSTs /api/sync/now: the server pulls when this
 *   device is clean, pushes when the server is untouched, and answers 409
 *   with a conflict otherwise; the dialog then offers the three exits.
 * - A running turn/job refuses the tap (the same rule as automatic sync) and
 *   says so for a few seconds instead of starting a swap under live writes.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { CloudIcon } from "lucide-react";
import { useT } from "@/components/i18n/i18n-provider";
import { apiErrorMessage } from "@/components/i18n/api-error";
import { useNotifyHub } from "@/components/server-events";
import { useSettingsDialog } from "@/components/settings/settings-dialog";
import { SyncConflictDialog } from "@/components/sync-conflict-dialog";
import { syncStatusLabel, syncStatusTone } from "@/components/sync-status-label";
import { cn } from "@/lib/utils";
import type { SyncConflictKind, SyncStatusPayload } from "@/src/core";

const POLL_INTERVAL_MS = 60_000;

export function SyncStatusControl({ compact = false }: { compact?: boolean }) {
	const t = useT();
	const { open: openSettings } = useSettingsDialog();
	const [status, setStatus] = useState<SyncStatusPayload | null>(null);
	const [pending, setPending] = useState(false);
	const [notice, setNotice] = useState<string | null>(null);
	const [conflictKind, setConflictKind] = useState<SyncConflictKind | null>(null);
	const inFlight = useRef(false);
	const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

	const flash = useCallback((text: string) => {
		setNotice(text);
		if (noticeTimer.current) clearTimeout(noticeTimer.current);
		noticeTimer.current = setTimeout(() => setNotice(null), 4_000);
	}, []);

	const readStatus = useCallback(async () => {
		if (inFlight.current) return;
		inFlight.current = true;
		try {
			const res = await fetch("/api/sync/status", { cache: "no-store" });
			if (res.ok) setStatus((await res.json()) as SyncStatusPayload);
		} catch {
			// Keep the last known state; the next poll retries.
		} finally {
			inFlight.current = false;
		}
	}, []);

	useEffect(() => {
		void readStatus();
		const timer = setInterval(() => void readStatus(), POLL_INTERVAL_MS);
		return () => {
			clearInterval(timer);
			if (noticeTimer.current) clearTimeout(noticeTimer.current);
		};
	}, [readStatus]);

	// Optional provider: isolated renders (tests, embeds) still poll; a
	// mounted app reacts to Settings' own connect/disconnect at once.
	const hub = useNotifyHub();
	useEffect(() => {
		if (!hub) return;
		const off = hub.subscribe("sync-changed", () => void readStatus());
		return () => { off(); };
	}, [hub, readStatus]);

	const syncNow = async () => {
		if (!status) return;
		if (!status.configured) {
			openSettings("sync");
			return;
		}
		if (status.conflict) {
			setConflictKind(status.conflict.kind);
			return;
		}
		if (status.syncing || pending) return;
		if (status.busy) {
			flash(t(status.busyReason === "turn" ? "syncStatus.busyTurn" : "syncStatus.busyJob"));
			return;
		}
		setPending(true);
		setNotice(null);
		try {
			const res = await fetch("/api/sync/now", { method: "POST" });
			const body = (await res.json().catch(() => ({}))) as {
				kind?: unknown;
				conflict?: { kind?: unknown };
			} & Record<string, unknown>;
			if (!res.ok) {
				if (res.status === 409 && body.conflict?.kind) {
					setConflictKind(body.conflict.kind as SyncConflictKind);
				} else if (res.status === 409) {
					flash(t(status.busyReason === "job" ? "syncStatus.busyJob" : "syncStatus.busyTurn"));
				} else {
					flash(t("syncStatus.failed", { detail: apiErrorMessage(t, body) ?? String(res.status) }));
				}
			} else if (body.kind === "pushed") {
				flash(t("syncStatus.pushed"));
			} else if (body.kind === "pulled") {
				flash(t("syncStatus.pulled"));
				setTimeout(() => window.location.reload(), 800);
			} else if (body.kind === "conflict") {
				setConflictKind((body.conflict?.kind as SyncConflictKind | undefined) ?? "remote_diverged");
			} else {
				flash(t("syncStatus.upToDate"));
			}
		} catch (error) {
			flash(t("syncStatus.failed", { detail: error instanceof Error ? error.message : String(error) }));
		} finally {
			setPending(false);
			void readStatus();
		}
	};

	const tone = pending ? "pending" : syncStatusTone(status);
	const label = pending ? t("syncStatus.syncing") : syncStatusLabel(status, t) || t("syncStatus.never");
	const title = status?.lastError
		? `${t("syncStatus.label")} · ${status.lastError}`
		: `${t("syncStatus.label")} · ${t("syncStatus.action")}`;

	return (
		<div className="relative shrink-0">
			<button
				type="button"
				data-testid="sync-status-control"
				data-tone={tone}
				aria-label={t("syncStatus.action")}
				title={title}
				onClick={() => void syncNow()}
				className={cn(
					"lh-no-drag flex h-7 shrink-0 items-center gap-1.5 rounded-full border px-2 text-xs font-medium transition-colors",
					tone === "error"
						? "border-error/50 text-error hover:bg-error/10"
						: tone === "pending"
							? "border-border text-foreground"
							: "border-border/80 text-muted-foreground hover:border-border hover:text-foreground",
				)}
			>
				<CloudIcon aria-hidden="true" className={cn("size-3.5", tone === "pending" && "animate-pulse")} />
				<span className={cn("max-w-28 truncate", compact && "max-w-20")}>{label}</span>
			</button>
			{notice && (
				<p
					role="status"
					className="absolute top-full right-0 z-50 mt-1 w-56 rounded-lg border bg-popover p-2 text-xs text-popover-foreground shadow-lg"
				>
					{notice}
				</p>
			)}
			{conflictKind && (
				<SyncConflictDialog
					conflict={conflictKind}
					onClose={() => setConflictKind(null)}
					onChanged={() => void readStatus()}
				/>
			)}
		</div>
	);
}
