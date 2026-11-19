"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { BrailleSpinner } from "@/components/braille-spinner";
import { englishT, useT } from "@/components/i18n/i18n-provider";
import { SettingsRow, Toggle } from "./controls.tsx";

/** Observational snapshot from electron/main.cjs; never updater permission. */
export type UpdateState = {
	status: "idle" | "checking" | "downloading" | "up-to-date" | "downloaded" | "error" | "disabled";
	version: string | null;
	revision: number;
};

export const APP_VERSION = process.env.LH_VERSION ?? "";
const HOMEPAGE = process.env.LH_HOMEPAGE ?? "";
/** The English wording, sourced from the catalog so the two never drift.
 * The rendered copy comes from `t(...)` — these constants are what a test
 * (and the English fallback) reads. */
export const MANUAL_UPDATE_HINT = englishT("settings.updates.manualHint");
export const AUTO_UPDATE_HINT = englishT("settings.updates.autoHint");
const UPDATE_ERROR = englishT("settings.updates.error");

/** Subscribe before requesting the snapshot. IPC replies and pushes can
 * cross; a revision prevents an older reply from hiding a newer event.
 * The banner shares this read-only observer so late loads recover too. */
export function useUpdateState() {
	const [state, setState] = useState<UpdateState | null>(null);
	const [failed, setFailed] = useState(false);
	useEffect(() => {
		const lh = window.lh;
		if (!lh) return;
		let live = true;
		let revision = -1;
		const accept = (next: UpdateState) => {
			if (!live || next.revision < revision) return;
			revision = next.revision;
			setState(next);
			setFailed(false);
		};
		const off = lh.onUpdateStatus?.(accept);
		void lh.getUpdateState?.().then(accept).catch(() => {
			if (live && revision === -1) setFailed(true);
		});
		return () => { live = false; off?.(); };
	}, []);
	return { state, failed };
}

/** The status line, in the caller's language. Without a translator the
 * English wording — today's — is what a caller gets. */
export function updateStatusText(state: UpdateState | null, t: typeof englishT = englishT): string | null {
	switch (state?.status) {
		case "checking": return t("settings.updates.checking");
		case "downloading": return state.version ? t("settings.updates.downloadingVersion", { version: state.version }) : t("settings.updates.downloading");
		case "up-to-date": return t("settings.updates.upToDate");
		case "downloaded": return state.version ? t("settings.updates.readyVersion", { version: state.version }) : t("settings.updates.readyGeneric");
		case "error": return t("settings.updates.error");
		default: return null;
	}
}

/** Version information is useful everywhere; update controls only belong
 * to a shell with an available updater. Opening this row never checks. */
export function UpdateSettings({
	autoUpdate,
	onAutoUpdateChange,
	version = APP_VERSION,
	homepage = HOMEPAGE,
}: {
	autoUpdate: boolean;
	onAutoUpdateChange: (on: boolean) => void;
	version?: string;
	homepage?: string;
}) {
	const t = useT();
	const { state, failed } = useUpdateState();
	const [checkFailed, setCheckFailed] = useState(false);
	useEffect(() => setCheckFailed(false), [state]);
	const active = state !== null && state.status !== "disabled";
	const busy = state?.status === "checking" || state?.status === "downloading";
	const status = state?.status === "downloaded" ? updateStatusText(state, t)
		: failed || checkFailed ? t("settings.updates.error") : updateStatusText(state, t);
	const releaseNotes = version && homepage ? `${homepage}/releases/tag/v${version}` : null;
	const check = () => {
		setCheckFailed(false);
		void window.lh?.checkForUpdates?.().catch(() => setCheckFailed(true));
	};

	return (
		<>
			<SettingsRow
				label={t("settings.updates.versionLabel", { version: version || t("settings.updates.unknownVersion") })}
				testid="row-version"
				hint={
					<>
						{status && <span className="block" role="status" data-testid="update-status">{status}</span>}
						{active && <span className="block">{t("settings.updates.manualHint")}</span>}
						{releaseNotes && <a href={releaseNotes} target="_blank" rel="noopener noreferrer" className="underline-offset-2 hover:text-foreground hover:underline" data-testid="release-notes">{t("settings.updates.releaseNotes")}</a>}
					</>
				}
			>
				{active && (state.status === "downloaded" ? (
					<Button type="button" size="xs" className="cursor-pointer" data-testid="update-restart" onClick={() => window.lh?.installUpdate?.()}>{t("settings.updates.restart")}</Button>
				) : (
					<Button type="button" size="xs" variant="outline" className="cursor-pointer disabled:cursor-not-allowed" data-testid="update-check" disabled={busy} aria-busy={busy} onClick={check}>
						{busy && <BrailleSpinner label={state.status === "downloading" ? t("settings.updates.downloadingLabel") : t("settings.updates.checkingLabel")} />}
						{t("settings.updates.check")}
					</Button>
				))}
			</SettingsRow>
			{active && (
				<SettingsRow label={t("settings.updates.automatic")} hint={t("settings.updates.autoHint")} testid="row-auto-update">
					<Toggle checked={autoUpdate} label={t("settings.updates.autoLabel")} onChange={onAutoUpdateChange} />
				</SettingsRow>
			)}
		</>
	);
}
