/**
 * Plan map and probe assessment cards.
 *
 * The diagram itself is the desktop's own `PlanDiagram` (read-only import),
 * so the map looks and behaves the same; mobile only supplies the tree, the
 * derived statuses and a scrollable full-screen sheet instead of the
 * desktop's pan/zoom window.
 */

import { useMemo, useState } from "react";
import { Markdown } from "./markdown";
import { BottomSheet } from "./bottom-sheet";
import { useI18n } from "../platform/i18n-provider";
import { MOBILE_STRINGS } from "../strings";
import { cn } from "@/lib/utils";
import { derivedNodeStatus, derivePlanStatusesLh, type PlanTree } from "@/src/core/contracts/plan.ts";
import type { AgentMessage } from "@earendil-works/pi-agent-core";
import { PlanDiagram } from "@/components/plan-block";
import type { ProbeDoneInput } from "@/src/core/contracts/probe.ts";

function graphOf(tree: PlanTree) {
	return {
		nodes: tree.nodes.map((node) => ({ id: node.id, title: node.title })),
		edges: tree.edges.map((edge) => ({ from: edge.from, to: edge.to })),
	};
}

export function PlanCard({ tree, messages, callId }: { tree: PlanTree; messages: readonly AgentMessage[]; callId: string }) {
	const { locale } = useI18n();
	const strings = MOBILE_STRINGS[locale];
	const [open, setOpen] = useState(false);
	const graph = useMemo(() => graphOf(tree), [tree]);
	const statuses = useMemo(() => derivePlanStatusesLh(tree, messages as never), [tree, messages]);
	const statusOf = (id: string) => derivedNodeStatus(statuses, id);

	return (
		<>
			<button
				type="button"
				onClick={() => setOpen(true)}
				className="block w-full overflow-hidden rounded-xl border border-border bg-card text-left active:bg-accent/50"
				data-testid="plan-card"
			>
				<div className="flex items-center justify-between px-3.5 pt-3">
					<span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{strings.planTitle}</span>
					<span className="text-xs text-muted-foreground">{strings.planOpen}</span>
				</div>
				<div className="pointer-events-none px-2 pb-2">
					<PlanDiagram
						nodes={graph.nodes}
						edges={graph.edges}
						statusOf={() => "upcoming"}
						markerId={`mobile-plan-mini-${callId}`}
						pad={10}
						monochrome
					/>
				</div>
			</button>

			<BottomSheet open={open} onClose={() => setOpen(false)} title={strings.planTitle}>
				<div className="lh-scroll overflow-auto px-2 pb-6 pt-1">
					<PlanDiagram
						nodes={graph.nodes}
						edges={graph.edges}
						statusOf={statusOf}
						glowId={statuses.current}
						markerId={`mobile-plan-full-${callId}`}
						pad={28}
						naturalSize
					/>
				</div>
			</BottomSheet>
		</>
	);
}

export function ProbeAssessmentCard({ input }: { input: unknown }) {
	const { locale } = useI18n();
	const strings = MOBILE_STRINGS[locale];
	const assessment = (input as ProbeDoneInput | null)?.assessment;
	if (!assessment || !Array.isArray(assessment.strands)) return null;
	return (
		<div className="rounded-xl border border-border bg-card p-3.5" data-testid="probe-assessment">
			<div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">{strings.probeAssessment}</div>
			<div className="flex flex-col gap-2.5">
				{assessment.strands.map((strand, index) => (
					<div key={`${strand.strand}-${index}`} className={cn("border-l-2 border-border pl-3", index === 0 && "border-foreground/40")}>
						<div className="text-sm font-medium">
							<Markdown text={strand.strand} />
						</div>
						<div className="mt-0.5 text-sm text-muted-foreground">
							<Markdown text={strand.assessment} />
						</div>
					</div>
				))}
				{assessment.summary ? (
					<div className="mt-1 border-t border-border/60 pt-2 text-sm text-muted-foreground">
						<Markdown text={assessment.summary} />
					</div>
				) : null}
			</div>
		</div>
	);
}
