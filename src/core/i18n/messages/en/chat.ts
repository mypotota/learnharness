/**
 * THE CHAT AREA (i18n wave, 2026-11-19): the session surface's own copy —
 * the header's rename affordances, the plan chip, the empty state, the
 * turn states and the dock's reconciliation notices.
 *
 * The English text IS today's wording, exactly.
 */

export const chat = {
	compacting: "Compacting context",
	compactingLabel: "COMPACTING CONTEXT…",
	somethingWentWrong: "Something went wrong: {message}",
	retry: "Retry",
	setupModels: "Set up your models",
	newSession: "New session",
	emptyDescription: "The teacher will open by probing what you already know.",
	renameSession: "Rename session",
	renameThisSession: "Rename this session",
	sessionTitle: "Session title",
	openFullPlan: "Open the full plan",
	plan: "Plan",
	practice: "Practice",
	nextProblem: "Next problem",
	retrying: "Retrying…",
	syncFailed: "Could not sync the saved session.",
	retrySyncing: "Retry syncing",
	preparingQuestion: "Preparing question…",
	questionUnavailable: "Question unavailable",
	dismissQuestion: "Dismiss question",

/* The Esc abort guard (components/abort-turn-dialog.tsx). */
	abortTurnTitle: "Abort this turn?",
	abortTurnLine: "The partial answer stays in the transcript.",
	abortAction: "Abort",
	dismissQuestionTitle: "Dismiss this question?",
	dismissQuestionLine: "Skipped — the teacher moves on without it.",
	dismissAction: "Dismiss",
	discardProblemTitle: "Discard this problem?",
	discardProblemLine: "The problem is dropped — no solution is revealed.",
	discardAction: "Discard",
	busyStopsToo: " The working turn stops too.",
/* Transcript dividers + thinking rows (compaction-divider, ai-elements). */
	contextCompacted: "Context compacted",
	historyCompacted: "History compacted",
	agentThinking: "AGENT’S THINKING",
	thinking: "Thinking",
	thinkingStreaming: "Thinking...",
/* Branch navigation (ai-elements/message.tsx). */
	nextBranch: "Next branch",
	previousBranch: "Previous branch",
} as const;
