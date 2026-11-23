"use client";

/**
 * THE SYNC-CONFLICT DIALOG: a conflict is a decision, not an error — the
 * dialog shows what happened and offers exactly three exits: overwrite the
 * server with this device, replace this device with the server, or leave
 * the conflict for later. Both destructive exits are explicit buttons (no
 * hidden force flag), and the pull path reports the backup directory the
 * import left beside the data root.
 */

import { useState } from "react";
import { HostDialog } from "@/components/host-dialog";
import { useT } from "@/components/i18n/i18n-provider";
import { apiErrorMessage } from "@/components/i18n/api-error";
import type { MessageKey } from "@/src/core/i18n";
import type { SyncConflictKind } from "@/src/core";

const CONFLICT_KEYS: Record<SyncConflictKind, MessageKey> = {
	remote_ahead: "settings.sync.conflictRemoteAhead",
	remote_rollback: "settings.sync.conflictRemoteRollback",
	remote_diverged: "settings.sync.conflictRemoteDiverged",
	local_changed: "settings.sync.conflictLocalChanged",
	remote_empty: "settings.sync.conflictRemoteEmpty",
	local_empty: "settings.sync.conflictRemoteEmpty",
};

type Outcome =
	| { kind: "idle" }
	| { kind: "busy"; action: "push" | "pull" }
	| { kind: "error"; text: string }
	| { kind: "done"; action: "push" | "pull"; backupDir?: string | null };

export function SyncConflictDialog({
	conflict,
	onClose,
	onChanged,
}: {
	conflict: SyncConflictKind;
	onClose: () => void;
	/** A resolved conflict changes the status the caller displays. */
	onChanged?: () => void;
}) {
	const t = useT();
	const [outcome, setOutcome] = useState<Outcome>({ kind: "idle" });

	const resolve = async (action: "push" | "pull") => {
		setOutcome({ kind: "busy", action });
		try {
			const res = await fetch(`/api/sync/${action}`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify(
					action === "push"
						? { force: true, confirm: "overwrite-remote" }
						: { force: true, confirm: "replace-local" },
				),
			});
			const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
			if (!res.ok) {
				setOutcome({ kind: "error", text: apiErrorMessage(t, body) ?? String(res.status) });
				return;
			}
			onChanged?.();
			setOutcome({
				kind: "done",
				action,
				backupDir: typeof body.backupDir === "string" ? body.backupDir : null,
			});
		} catch (error) {
			setOutcome({ kind: "error", text: error instanceof Error ? error.message : String(error) });
		}
	};

	const busy = outcome.kind === "busy";
	const frame = (
		<div className="mx-4 w-full max-w-md rounded-xl border bg-card p-5 shadow-lg" onClick={(e) => e.stopPropagation()}>
			<h2 className="text-sm font-semibold text-card-foreground" data-testid="sync-conflict-title">
				{t("syncStatus.conflictTitle")}
			</h2>
			<p className="mt-1.5 text-xs text-muted-foreground" data-testid="sync-conflict-summary">
				{t(CONFLICT_KEYS[conflict])}
			</p>
			{outcome.kind === "error" && (
				<p role="alert" className="mt-2 rounded-sm border border-error/40 px-3 py-2 text-xs text-error">
					{t("syncStatus.failed", { detail: outcome.text })}
				</p>
			)}
			{outcome.kind === "done" && (
				<div className="mt-2 rounded-sm border border-border/60 px-3 py-2 text-xs">
					<p className="text-card-foreground">
						{outcome.action === "push" ? t("syncStatus.conflictPushed") : t("syncStatus.conflictPulled")}
					</p>
					{outcome.backupDir && (
						<p className="mt-1 break-all text-muted-foreground">
							{t("syncStatus.conflictBackup", { path: outcome.backupDir })}
						</p>
					)}
				</div>
			)}
			<div className="mt-4 flex flex-wrap justify-end gap-2">
				{outcome.kind === "done" ? (
					<>
						{outcome.action === "pull" && (
							<button
								type="button"
								data-testid="sync-conflict-reload"
								onClick={() => window.location.reload()}
								className="rounded-sm border border-primary/50 bg-primary/10 px-3 py-1.5 text-xs text-primary transition-colors hover:bg-primary/20"
							>
								{t("syncStatus.reload")}
							</button>
						)}
						<button
							type="button"
							data-testid="sync-conflict-close"
							onClick={onClose}
							className="rounded-sm px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
						>
							{t("common.close")}
						</button>
					</>
				) : (
					<>
						<button
							type="button"
							data-testid="sync-conflict-later"
							disabled={busy}
							onClick={onClose}
							className="rounded-sm px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
						>
							{t("syncStatus.conflictLater")}
						</button>
						<button
							type="button"
							data-testid="sync-conflict-pull"
							disabled={busy}
							onClick={() => void resolve("pull")}
							className="rounded-sm border border-error/50 bg-error/10 px-3 py-1.5 text-xs text-error transition-colors hover:bg-error/20 disabled:opacity-40"
						>
							{t("syncStatus.conflictKeepLocal")}
						</button>
						<button
							type="button"
							data-testid="sync-conflict-push"
							disabled={busy}
							onClick={() => void resolve("push")}
							className="rounded-sm border border-error/50 bg-error/10 px-3 py-1.5 text-xs text-error transition-colors hover:bg-error/20 disabled:opacity-40"
						>
							{t("syncStatus.conflictKeepRemote")}
						</button>
					</>
				)}
			</div>
		</div>
	);
	return (
		<HostDialog
			open
			frame={frame}
			aria-label={t("syncStatus.conflictTitle")}
			onClose={() => {
				onClose();
				return "closed";
			}}
			backdropProps={{
				className: "fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm",
				"data-testid": "sync-conflict-dialog",
			}}
		>
			{frame.props.children}
		</HostDialog>
	);
}
