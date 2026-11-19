/**
 * THE PRACTICE AREA (i18n wave, 2026-11-19): the practice cards — the
 * posed problem, the conclusion record and its metadata popover, the
 * learner-thinking row.
 *
 * The English text IS today's wording, exactly.
 */

export const practice = {
	problem: "Problem",
	problemDismissed: "Problem dismissed.",
	concluded: "Concluded",
	modelSolution: "Model solution",
	metadata: "Metadata",
	mode: "Mode",
	targets: "Targets",
	outcome: "Outcome",
	hintRung: "Hint rung",
	missClass: "Miss class",
	retest: "Retest",
	yourThinking: "YOUR THINKING",
	outcomeSolved: "Solved",
	outcomeSolvedWithHints: "Solved with hints",
	outcomeMovedOn: "Moved on",
	outcomeSurrendered: "Surrendered",
	outcomeDismissed: "Dismissed",
	valueUntagged: "untagged",
	valueNone: "none",
	valueYes: "yes",
	valueNo: "no",

/* The reading-thinking field (components/reading-thinking.tsx). */
	readingThinking: "Thinking while reading",
	readingThinkingPlaceholder: "Whatever comes to mind as you read.",
/* The practice dock (components/practice-dock.tsx). */
	problemTitle: "Problem",
	dockHint: "Work here, think out loud.",
	/* The plugin problem dock's sync states. */
	preparingProblem: "Preparing problem…",
	problemUnavailable: "Problem unavailable",
} as const;
