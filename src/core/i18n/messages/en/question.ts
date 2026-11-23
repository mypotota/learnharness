/**
 * THE QUESTION AREA (i18n wave, 2026-11-19): the built-in question dock —
 * the collapsed bar, the reveal invitation, options, the confidence
 * slider and the answer form.
 *
 * The English text IS today's wording, exactly.
 */

export const question = {
	answer: "Answer",
	open: "Open",
	checkUnderstanding: "Check your understanding",
	kindCheck: "Check",
	kindProbe: "Probe",
	kindRecall: "Recall",
	kindExplain: "Explain",
	kindQuestion: "Question",
	selectAllThatApply: " · select all that apply",
	kindPredict: "Prediction",
	verdictCorrect: "correct",
	verdictIncorrect: "incorrect",
	verdictDontKnow: "didn't know",
	answeredDontKnow: "Answered “I don't know”.",
	skipped: "— skipped",
	why: "Why",
	hideWhy: "Hide why",
	whyLabel: "Why: ",
	answerLabel: "The answer: ",
	dontKnow: "I don't know",
	confidence: "Confidence",
	confidenceAria: "Confidence — the probability your selected answer is correct",
	confidenceHint: "The probability your selected answer is correct — 50% is a coin flip. Adjust with ←/→.",
	confidencePercent: "{value} percent",
	typeAnswer: "Type your answer…",
	typeOwnAnswer: "Type your own answer…",
	thinkingPlaceholder: "Why this answer? Whatever comes to mind.",
	compactingSession: "compacting session…",
	submitHint: "↵ submits · ⇧↵ newline",
	submitAnswer: "Submit answer",
	pluginPreparing: "Preparing question…",
	pluginUnavailable: "Question unavailable",
	pluginDismiss: "Dismiss question",
	pluginYourThinking: "Your thinking",

/* Malformed-question recovery (components/malformed-question.tsx). */
	undisplayable: "This question could not be displayed.",
	retryQuestion: "Retry question",
	retryHint: " Retry it or send a message to continue.",
	retryTitleFallback: "Requests a replacement from the model.",
/* The learner's submitted images (components/submitted-images.tsx). */
	submittedImage: "Submitted image",
	openSubmittedFullscreen: "Open submitted image fullscreen",
	dismissed: "Question dismissed",
} as const;
