"use client";
/**
 * Settings → Sync (webdav-sync wave, 2026-11-21): configure the WebDAV
 * endpoint + Basic-auth credential, test it, move data by hand, and watch
 * the automatic loop's state.
 *
 * The password is write-only: the server never returns it, so the field is
 * blank on load and an empty submit means "keep the saved one". Everything
 * else is a thin view over GET /api/sync/status — sizes included, which is
 * the answer to "how big is my learning data, and how big was the package".
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { CloudIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useT } from "@/components/i18n/i18n-provider";
import { apiErrorMessage } from "@/components/i18n/api-error";
import { useServerEvent } from "@/components/server-events";
import { SyncConflictDialog } from "@/components/sync-conflict-dialog";
import { SettingsRow, Toggle } from "./controls.tsx";
import type { MessageKey } from "@/src/core/i18n";
import type { SyncConflictKind, SyncStatusPayload } from "@/src/core";

type Pending = "save" | "test" | "push" | "pull" | "clear" | null;

function formatBytes(bytes: number): string {
	if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
	const units = ["B", "KB", "MB", "GB", "TB"];
	let value = bytes;
	let unit = 0;
	while (value >= 1024 && unit < units.length - 1) {
		value /= 1024;
		unit += 1;
	}
	return `${value >= 100 || unit === 0 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}

function formatWhen(iso: string | null, fallback: string): string {
	if (!iso) return fallback;
	const date = new Date(iso);
	return Number.isNaN(date.getTime()) ? fallback : date.toLocaleString();
}

const CONFLICT_KEYS: Record<SyncConflictKind, string> = {
	remote_ahead: "settings.sync.conflictRemoteAhead",
	remote_rollback: "settings.sync.conflictRemoteRollback",
	remote_diverged: "settings.sync.conflictRemoteDiverged",
	local_changed: "settings.sync.conflictLocalChanged",
	remote_empty: "settings.sync.conflictRemoteEmpty",
	local_empty: "settings.sync.conflictRemoteEmpty",
};

export function SyncSection() {
	const t = useT();
	const [status, setStatus] = useState<SyncStatusPayload | null>(null);
	const [url, setUrl] = useState("");
	const [username, setUsername] = useState("");
	const [password, setPassword] = useState("");
	const [autoSync, setAutoSync] = useState(true);
	// The dialog keeps the kind it opened with: resolving clears the live
	// status, and the dialog still has to show its outcome (and backup path).
	const [conflictKind, setConflictKind] = useState<SyncConflictKind | null>(null);
	const [pending, setPending] = useState<Pending>(null);
	const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
	const initialized = useRef(false);
	const inFlight = useRef(false);

	const applyStatus = useCallback((next: SyncStatusPayload) => {
		setStatus(next);
		if (!initialized.current) {
			initialized.current = true;
			setUrl(next.url ?? "");
			setUsername(next.username ?? "");
			setAutoSync(next.autoSync);
		}
	}, []);

	const readStatus = useCallback(async () => {
		if (inFlight.current) return;
		inFlight.current = true;
		try {
			const res = await fetch("/api/sync/status", { cache: "no-store" });
			if (res.ok) applyStatus((await res.json()) as SyncStatusPayload);
		} catch {
			// The card keeps the last known state; the next poll retries.
		} finally {
			inFlight.current = false;
		}
	}, [applyStatus]);

	useEffect(() => {
		void readStatus();
		const timer = setInterval(() => void readStatus(), 2_000);
		return () => clearInterval(timer);
	}, [readStatus]);

	useServerEvent("sync-changed", () => {
		void readStatus();
	});

	const send = useCallback(
		async (
			action: Exclude<Pending, null>,
			path: string,
			init: RequestInit,
			failureKey: "settings.sync.saveFailed" | "settings.sync.testFailed" | "settings.sync.actionFailed" | "settings.sync.clearFailed",
		): Promise<Record<string, unknown> | null> => {
			setPending(action);
			setNotice(null);
			try {
				const res = await fetch(path, init);
				const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
				if (!res.ok) {
					setNotice({ kind: "error", text: t(failureKey as MessageKey, { detail: apiErrorMessage(t, body) ?? String(res.status) }) });
					return null;
				}
				return body;
			} catch (error) {
				setNotice({ kind: "error", text: t(failureKey as MessageKey, { detail: error instanceof Error ? error.message : String(error) }) });
				return null;
			} finally {
				setPending(null);
			}
		},
		[t],
	);

	const save = useCallback(async () => {
		if (!url.trim()) return setNotice({ kind: "error", text: t("settings.sync.missingUrl") });
		if (!username.trim()) return setNotice({ kind: "error", text: t("settings.sync.missingUser") });
		if (!password && !status?.configured) return setNotice({ kind: "error", text: t("settings.sync.missingPassword") });
		const body = await send("save", "/api/sync/config", {
			method: "PUT",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ url: url.trim(), username: username.trim(), password, autoSync }),
		}, "settings.sync.saveFailed");
		if (!body) return;
		setPassword("");
		applyStatus(body as unknown as SyncStatusPayload);
		setNotice({ kind: "ok", text: t("settings.sync.testOk") });
	}, [applyStatus, autoSync, password, send, status?.configured, t, url, username]);

	const test = useCallback(async () => {
		const body = await send("test", "/api/sync/test", { method: "POST" }, "settings.sync.testFailed");
		if (!body) return;
		if (body.remote === "empty") {
			setNotice({ kind: "ok", text: t("settings.sync.testEmpty") });
			return;
		}
		const actionKey =
			body.action === "push"
				? "settings.sync.actionPush"
				: body.action === "pull"
					? "settings.sync.actionPull"
					: body.action === "conflict"
						? "settings.sync.actionConflict"
						: "settings.sync.actionNone";
		setNotice({ kind: "ok", text: `${t("settings.sync.testOk")} ${t(actionKey as MessageKey)}` });
	}, [send, t]);

	const push = useCallback(
		async (force: boolean) => {
			const body = await send("push", "/api/sync/push", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify(force ? { force: true, confirm: "overwrite-remote" } : {}),
			}, "settings.sync.actionFailed");
			if (!body) return;
			if (body.kind === "pushed") {
				const size = (body.package as { size?: number } | undefined)?.size ?? 0;
				setNotice({ kind: "ok", text: t("settings.sync.pushDone", { size: formatBytes(size) }) });
			} else if (body.kind === "up_to_date") {
				setNotice({ kind: "ok", text: t("settings.sync.alreadyInSync") });
			}
			void readStatus();
		},
		[readStatus, send, t],
	);

	const pull = useCallback(
		async (force: boolean) => {
			const body = await send("pull", "/api/sync/pull", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify(force ? { force: true, confirm: "replace-local" } : {}),
			}, "settings.sync.actionFailed");
			if (!body) return;
			if (body.kind === "pulled") {
				const size = typeof body.packageBytes === "number" ? body.packageBytes : 0;
				setNotice({ kind: "ok", text: t("settings.sync.pullDone", { size: formatBytes(size) }) });
				// The imported records replace the page's data; reload so every
				// surface re-reads from disk.
				setTimeout(() => window.location.reload(), 600);
			} else if (body.kind === "up_to_date") {
				setNotice({ kind: "ok", text: t("settings.sync.alreadyInSync") });
			} else if (body.kind === "no_remote") {
				setNotice({ kind: "ok", text: t("settings.sync.testEmpty") });
			}
			void readStatus();
		},
		[readStatus, send, t],
	);

	const clear = useCallback(async () => {
		const body = await send("clear", "/api/sync/config", { method: "DELETE" }, "settings.sync.clearFailed");
		if (!body) return;
		initialized.current = false;
		setUrl("");
		setUsername("");
		setPassword("");
		setAutoSync(true);
		applyStatus(body as unknown as SyncStatusPayload);
	}, [applyStatus, send]);

	const toggleAutoSync = useCallback(
		async (next: boolean) => {
			setAutoSync(next);
			if (!status?.configured) return;
			const body = await send("save", "/api/sync/config", {
				method: "PUT",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ url: url.trim(), username: username.trim(), password: "", autoSync: next }),
			}, "settings.sync.saveFailed");
			if (body) applyStatus(body as unknown as SyncStatusPayload);
		},
		[applyStatus, send, status?.configured, url, username],
	);

	const busy = pending !== null || status?.syncing === true;
	const conflict = status?.conflict?.kind ?? null;
	const progress = status?.progress;
	const progressText =
		status?.syncing && progress
			? `${t("settings.sync.syncing")} ${formatBytes(progress.transferredBytes)}${
					progress.totalBytes > 0 ? ` / ${formatBytes(progress.totalBytes)}` : ""
				}`
			: null;

	return (
		<div className="flex flex-col gap-4">
			<SettingsRow label={t("settings.sync.endpoint")}>
				<Input
					data-testid="sync-url"
					value={url}
					onChange={(event) => setUrl(event.target.value)}
					placeholder={t("settings.sync.endpointPlaceholder")}
					spellCheck={false}
					autoComplete="off"
					className="w-72 max-sm:w-full"
				/>
			</SettingsRow>
			<SettingsRow label={t("settings.sync.username")}>
				<Input
					data-testid="sync-username"
					value={username}
					onChange={(event) => setUsername(event.target.value)}
					autoComplete="off"
					className="w-72 max-sm:w-full"
				/>
			</SettingsRow>
			<SettingsRow
				label={t("settings.sync.password")}
				hint={status?.configured ? t("settings.sync.passwordSaved") : undefined}
			>
				<Input
					data-testid="sync-password"
					type="password"
					value={password}
					onChange={(event) => setPassword(event.target.value)}
					autoComplete="new-password"
					className="w-72 max-sm:w-full"
				/>
			</SettingsRow>
			<SettingsRow label={t("settings.sync.autoSync")} hint={t("settings.sync.autoSyncHint")}>
				<Toggle
					checked={autoSync}
					disabled={busy}
					onChange={(next) => void toggleAutoSync(next)}
					label={t("settings.sync.autoSync")}
				/>
			</SettingsRow>

			{status?.insecureHttp && (
				<p role="alert" className="rounded-sm border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
					{t("settings.sync.insecure")}
				</p>
			)}

			<div className="flex flex-wrap gap-2">
				<Button data-testid="sync-save" size="sm" disabled={busy} onClick={() => void save()}>
					{pending === "save" ? t("settings.sync.saving") : t("settings.sync.save")}
				</Button>
				<Button data-testid="sync-test" size="sm" variant="outline" disabled={busy || !status?.configured} onClick={() => void test()}>
					{pending === "test" ? t("settings.sync.testing") : t("settings.sync.test")}
				</Button>
				<Button data-testid="sync-push" size="sm" variant="outline" disabled={busy || !status?.configured} onClick={() => void push(false)}>
					{t("settings.sync.push")}
				</Button>
				<Button data-testid="sync-pull" size="sm" variant="outline" disabled={busy || !status?.configured} onClick={() => void pull(false)}>
					{t("settings.sync.pull")}
				</Button>
				{status?.configured && (
					<Button size="sm" variant="ghost" disabled={busy} onClick={() => void clear()}>
						{t("settings.sync.clear")}
					</Button>
				)}
			</div>

			{notice && (
				<p
					role={notice.kind === "error" ? "alert" : "status"}
					className={`rounded-sm border px-3 py-2 text-xs ${
						notice.kind === "error" ? "border-error/40 text-error" : "border-border/60 text-muted-foreground"
					}`}
				>
					{notice.text}
				</p>
			)}

			{conflict && (
				<div role="alert" className="rounded-sm border border-error/40 px-3 py-2 text-xs text-error">
					<p className="font-medium">{t("settings.sync.conflictTitle")}</p>
					<p className="mt-1">{t(CONFLICT_KEYS[conflict] as MessageKey)}</p>
					<Button
						data-testid="sync-conflict-open"
						className="mt-2"
						size="xs"
						variant="outline"
						disabled={busy}
						onClick={() => setConflictKind(conflict)}
					>
						{t("syncStatus.resolve")}
					</Button>
				</div>
			)}
			{conflictKind && (
				<SyncConflictDialog
					conflict={conflictKind}
					onClose={() => setConflictKind(null)}
					onChanged={() => void readStatus()}
				/>
			)}

			<div data-testid="sync-status" className="rounded-sm border border-border/60 px-3 py-2 text-xs">
				{status === null ? (
					<p className="text-muted-foreground">{t("settings.dialog.loading")}</p>
				) : (
					<div className="flex flex-col gap-1">
						{!status.configured && <p className="text-muted-foreground">{t("settings.sync.notConfigured")}</p>}
						{progressText && <p className="text-muted-foreground">{progressText}</p>}
						{status.busyReason === "turn" && <p className="text-muted-foreground">{t("settings.sync.busyTurn")}</p>}
						{status.busyReason === "job" && <p className="text-muted-foreground">{t("settings.sync.busyJob")}</p>}
						<p>
							<span className="text-muted-foreground">{t("settings.sync.local")}: </span>
							{formatBytes(status.local?.totalBytes ?? 0)} ·{" "}
							{t("settings.sync.files", { count: status.local?.fileCount ?? 0 })} ·{" "}
							<span className="text-muted-foreground">{t("settings.sync.seq")} </span>
							{status.lastAppliedSeq}
						</p>
						<p>
							<span className="text-muted-foreground">{t("settings.sync.remote")}: </span>
							{status.remote ? (
								<>
									<span className="text-muted-foreground">{t("settings.sync.seq")} </span>
									{status.remote.seq} ·{" "}
									<span className="text-muted-foreground">{t("settings.sync.packageSize")} </span>
									{formatBytes(status.remote.packageBytes)}
								</>
							) : (
								t("settings.sync.never")
							)}
						</p>
						<p>
							<span className="text-muted-foreground">{t("settings.sync.lastSynced")}: </span>
							{formatWhen(status.lastSyncedAt, t("settings.sync.never"))}
							{status.lastDirection && (
								<>
									{" · "}
									<span className="text-muted-foreground">{t("settings.sync.direction")} </span>
									{status.lastDirection === "push" ? t("settings.sync.push") : t("settings.sync.pull")}
								</>
							)}
						</p>
						{status.lastTransfer && (
							<p>
								<span className="text-muted-foreground">{t("settings.sync.lastTransfer")}: </span>
								{formatBytes(status.lastTransfer.bytes)} · {formatWhen(status.lastTransfer.at, t("settings.sync.never"))}
							</p>
						)}
						<p>
							<span className="text-muted-foreground">
								{status.autoSync ? t("settings.sync.autoSyncOn") : t("settings.sync.autoSyncOff")}
							</span>
							{status.nextCheckAt && (
								<>
									{" · "}
									<span className="text-muted-foreground">{t("settings.sync.nextCheck")} </span>
									{formatWhen(status.nextCheckAt, t("settings.sync.never"))}
								</>
							)}
						</p>
						{!status.lastError && !conflict && !status.busy && !status.syncing && status.configured && (
							<p className="text-muted-foreground">{t("settings.sync.upToDate")}</p>
						)}
						{status.lastError && (
							<p role="alert" className="text-error">
								<span className="text-muted-foreground">{t("settings.sync.lastError")}: </span>
								{status.lastError}
							</p>
						)}
					</div>
				)}
			</div>
			<p className="flex items-center gap-1.5 text-xs text-muted-foreground/70">
				<CloudIcon aria-hidden="true" className="size-3.5" />
				{t("settings.sync.autoSyncHint")}
			</p>
		</div>
	);
}
