/**
 * THE COMPOSER AREA (i18n wave, 2026-11-19): the message input's own copy
 * — the placeholder, the send/stop affordances and the practice morph.
 *
 * The English text IS today's wording, exactly.
 */

export const composer = {
	placeholder: "Ask, answer, or steer the lesson…",
	placeholderNext: "Ask anything, or press Enter for the next one.",
	nextProblem: "Next problem",
	stop: "Stop",
	send: "Send",
	nodesSelected: "{count, plural, one {# node selected} other {# nodes selected}}",
	pickNodes: "Pick nodes",
/* Attachment affordances (attach-files-button, file-path-drop-zone). */
	browserNotice: "Local file paths can only be attached in the desktop app. You can paste a full path instead.",
	attachTitle: "Attach files or a folder",
	attachFilesAria: "Attach files",
	folderChooseFailed: "Could not choose a folder. Try again.",
	dropToAttach: "Drop to attach file paths",
	dismissAttachmentNotice: "Dismiss attachment notice",
	noPathsAvailable: "No local file paths were available. Drop existing files or folders from your computer.",
	openChatToAttach: "Open a chat to attach file paths.",
	someSkipped: "Some dropped items had no available file path.",
	/* The draft composers' topic placeholder (home + /chat/new) and the
	   dictation bar's affordances (components/dictation.tsx). */
	learnPlaceholder: "What do you want to learn?",
	practicePlaceholder: "What do you want to practice?",
	startSession: "Start session",
	dictate: "Dictate",
	startDictation: "Start dictation",
	stopDictation: "Stop dictation",
	stopDictationEsc: "Stop dictation (Esc)",
	dictationFailed: "Dictation failed: {error}",
} as const;
