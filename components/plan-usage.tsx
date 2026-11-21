"use client";

/**
 * THE PLAN-USAGE RING (usage-query wave, 2026-11-21).
 *
 * One 32px control: an INNER ring for the 5-hour plan window and an OUTER
 * ring for the 7-day window, both showing REMAINING percent (owner's
 * decision). The center carries the 5-hour number. Color is per ring:
 * >50% success, 20–50% warning, <20% error.
 *
 * Click opens the popover with both windows, their absolute reset instants
 * and the snapshot time. Data refreshes on mount, every 5 minutes, and
 * immediately whenever the popover opens. With no usable data the whole
 * entry renders nothing (presence-driven, never a fake zero).
 *
 * Provider resolution: callers on the home surfaces pass nothing and the
 * strong slot's provider is used; the session page passes its selected
 * model's provider. Only two providers have plan endpoints server-side;
 * everything else yields `usage: null` and therefore no entry.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { INTERACTION_LAYER_Z_BASE } from "@/components/host-dialog";
import { useModelCatalog } from "@/components/model-catalog";
import { usePopoverDismiss } from "@/components/popover-dismiss";
import { useT } from "@/components/i18n/i18n-provider";
import { Hint } from "@/components/ui/hint";
import type { PlanUsage, PlanUsageResponse, PlanUsageWindow } from "@/src/core";

const POLL_INTERVAL_MS = 5 * 60 * 1000;
const RING_SIZE = 32;
const RING_CENTER = RING_SIZE / 2;
const OUTER_RADIUS = 12;
const INNER_RADIUS = 8;
const RING_STROKE = 2.5;

/** Remaining-percent → the ring's ink. Null (no window) stays muted. */
function ringColor(percent: number | null): string {
	if (percent === null) return "text-muted-foreground/30";
	if (percent > 50) return "text-success";
	if (percent >= 20) return "text-warning";
	return "text-error";
}

function timeLabel(ms: number | null): string {
	if (ms === null) return "—";
	return new Date(ms).toLocaleString(undefined, {
		month: "numeric",
		day: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	});
}

/** One progress circle: a faint full track plus the remaining arc. */
function Ring({ radius, percent }: { radius: number; percent: number | null }) {
	const circumference = 2 * Math.PI * radius;
	const filled = percent === null ? 0 : (circumference * percent) / 100;
	return (
		<>
			<circle
				cx={RING_CENTER}
				cy={RING_CENTER}
				r={radius}
				fill="none"
				strokeWidth={RING_STROKE}
				stroke="currentColor"
				className="text-border"
			/>
			{filled > 0 && (
				<circle
					cx={RING_CENTER}
					cy={RING_CENTER}
					r={radius}
					fill="none"
					strokeWidth={RING_STROKE}
					strokeLinecap="round"
					stroke="currentColor"
					className={ringColor(percent)}
					strokeDasharray={`${filled} ${circumference - filled}`}
					transform={`rotate(-90 ${RING_CENTER} ${RING_CENTER})`}
				/>
			)}
		</>
	);
}

function UsageWindowRow({ label, window }: { label: string; window: PlanUsageWindow | null }) {
	const t = useT();
	const percent = window?.remainingPercent ?? null;
	return (
		<div className="py-1.5">
			<div className="flex items-baseline justify-between gap-3">
				<span className="text-muted-foreground">{label}</span>
				<span className={`tabular-nums ${ringColor(percent)}`}>
					{percent === null ? "—" : t("stats.planUsage.remaining", { percent })}
				</span>
			</div>
			<div className="mt-0.5 text-[10px] text-muted-foreground">
				{window ? t("stats.planUsage.resetsAt", { time: timeLabel(window.resetsAt) }) : "—"}
			</div>
		</div>
	);
}

export function PlanUsageControl({ provider }: { provider?: string }) {
	const t = useT();
	const { catalog } = useModelCatalog();
	const resolvedProvider = provider ?? catalog?.slots.strong?.model.provider;
	const [usage, setUsage] = useState<PlanUsage | null>(null);
	const [failed, setFailed] = useState(false);
	const [open, setOpen] = useState(false);
	const [loading, setLoading] = useState(false);
	const abortRef = useRef<AbortController | null>(null);
	const rootRef = useRef<HTMLDivElement>(null);
	const panelRef = useRef<HTMLDivElement>(null);
	const popupLayer = usePopoverDismiss(rootRef, open, () => setOpen(false), { layerRootRef: panelRef });

	const load = useCallback(() => {
		if (!resolvedProvider) return;
		abortRef.current?.abort();
		const controller = new AbortController();
		abortRef.current = controller;
		setLoading(true);
		fetch(`/api/usage/plan?provider=${encodeURIComponent(resolvedProvider)}`, {
			headers: { "x-learnharness-usage": "1" },
			cache: "no-store",
			signal: controller.signal,
		})
			.then((response) => (response.ok ? (response.json() as Promise<PlanUsageResponse>) : Promise.reject(new Error(String(response.status)))))
			.then((body) => {
				if (controller.signal.aborted) return;
				setUsage(body.usage);
				setFailed(false);
			})
			.catch(() => {
				if (!controller.signal.aborted) setFailed(true);
			})
			.finally(() => {
				if (!controller.signal.aborted) setLoading(false);
			});
	}, [resolvedProvider]);

	useEffect(() => {
		setUsage(null);
		setFailed(false);
		if (!resolvedProvider) return;
		load();
		const timer = setInterval(load, POLL_INTERVAL_MS);
		return () => {
			clearInterval(timer);
			abortRef.current?.abort();
		};
	}, [resolvedProvider, load]);

	// Opening the popover is an explicit freshen request.
	useEffect(() => {
		if (open) load();
	}, [open, load]);

	if (!usage) return null;

	const fiveHour = usage.fiveHour?.remainingPercent ?? null;
	const weekly = usage.weekly?.remainingPercent ?? null;

	return (
		<div ref={rootRef} className="relative">
			<Hint label={t("stats.planUsage.title")} side="bottom">
				<button
					type="button"
					aria-expanded={open}
					aria-label={t("stats.planUsage.title")}
					onClick={() => setOpen((current) => !current)}
					className={`flex size-8 items-center justify-center rounded-lg transition-colors hover:bg-accent ${open ? "text-foreground" : "text-muted-foreground"}`}
				>
					<svg viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`} className="size-8" aria-hidden="true">
						<Ring radius={OUTER_RADIUS} percent={weekly} />
						<Ring radius={INNER_RADIUS} percent={fiveHour} />
						<text
							x={RING_CENTER}
							y={RING_CENTER}
							textAnchor="middle"
							dominantBaseline="central"
							fontSize={9}
							className={`fill-current tabular-nums ${ringColor(fiveHour)}`}
						>
							{fiveHour === null ? "—" : Math.round(fiveHour)}
						</text>
					</svg>
				</button>
			</Hint>
			{open && (
				<div
					ref={panelRef}
					style={{ zIndex: INTERACTION_LAYER_Z_BASE + popupLayer.order }}
					className="absolute right-0 top-full mt-2"
				>
					<div className="w-64 max-w-[calc(100vw-1.5rem)] rounded-xl border bg-card/95 p-3 text-xs shadow-lg backdrop-blur">
						<div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
							{t("stats.planUsage.title")}
						</div>
						<UsageWindowRow label={t("stats.planUsage.fiveHour")} window={usage.fiveHour} />
						<UsageWindowRow label={t("stats.planUsage.weekly")} window={usage.weekly} />
						<div className="mt-1 border-t pt-2 text-[10px] text-muted-foreground">
							<p>{loading ? t("stats.planUsage.refreshing") : t("stats.planUsage.updatedAt", { time: timeLabel(usage.fetchedAt) })}</p>
							{failed && <p className="mt-0.5 text-warning">{t("stats.planUsage.refreshFailed")}</p>}
						</div>
					</div>
				</div>
			)}
		</div>
	);
}
