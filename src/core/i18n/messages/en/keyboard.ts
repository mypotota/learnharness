/**
 * THE KEYBOARD AREA (i18n wave, 2026-11-19): the shortcut registry's
 * cheat-sheet labels (src/core/keyboard.ts) — one key per KeyAction id,
 * camelCased.
 *
 * The English text IS today's wording, exactly.
 */

export const keyboard = {
	title: "Keyboard shortcuts",
	escToClose: "Esc to close",
	scopeGlobal: "Global",
	scopeChat: "Chat",
	scopeAppWide: "App-wide",
	scopeViews: "Views: {views}",
	toggleDictation: "Toggle dictation",
	openSettings: "Open settings",
	modelSelector: "Model selector",
	cycleThinkingLevel: "Cycle thinking level",
	toggleSessionsSidebar: "Toggle sessions sidebar",
	searchSessions: "Search sessions",
	graphView: "Graph view",
	newSession: "New session",
	renameSession: "Rename session",
	toggleAllYourThinking: "Toggle all your thinking",
	askForNudge: "Question · ask for a nudge (side thread)",
	find: "Find",
	cheatSheet: "Shortcut cheat sheet",
	focusThinkingRows: "Question · focus thinking ↔ rows",
	nextRow: "Question · next row",
	prevRow: "Question · previous row",
	pickRow: "Question · pick row",
	submit: "Question · submit",
} as const;
