/**
 * THE ACTIVITY AREA (i18n wave, 2026-11-19): the sidebar's bottom strip —
 * background agents, extraction runs, and each blob's inline detail.
 *
 * The English text IS today's wording, exactly.
 */

export const activity = {
	sectionTitle: "Background agents",
	totalCostTitle: "Total running cost (inferred)",
	labelResearcher: "Researcher",
	labelDemoBuilder: "Demo builder",
	labelFigureMaker: "Figure maker",
	labelPdfReader: "PDF reader",
	labelPluginWorker: "Plugin worker",
	labelSubagent: "Sub-agent",
	extractionLabel: "Extraction — {phase}",
	abortFailed: "Abort failed — try again",
	endProcess: "End this background process",
	endAria: "End {label} in {title}",
	stopping: "Stopping…",
	detailCost: "Cost",
	detailContext: "Context",
	detailModel: "Model",
	detailSteps: "Steps",
	openSession: "Open session →",
/* The dispatch card's kind labels (components/artifacts/dispatch-card.tsx) —
 * deliberately the AGENT phrasing, distinct from the dock's role labels. */
	kindResearch: "Research agent",
	kindDemo: "Demo agent",
	kindFigure: "Figure agent",
	kindPdfReader: "PDF reader",
	kindPluginWorker: "Plugin worker",
} as const;
