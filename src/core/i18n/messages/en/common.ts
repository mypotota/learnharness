/**
 * THE COMMON AREA (i18n wave, 2026-11-19): the vocabulary every surface
 * shares — buttons, dialogs and states that are not tied to one feature.
 *
 * Key convention: `<area>.<element>[.<qualifier>]`, lower camelCase, dot
 * separated, at most four segments. Semantic, never the English wording —
 * the wording is what CHANGES when the copy is edited, the key is not.
 */

export const common = {
	cancel: "Cancel",
	confirm: "Confirm",
	close: "Close",
	save: "Save",
	saved: "Saved",
	delete: "Delete",
	rename: "Rename",
	copy: "Copy",
	copied: "Copied",
	loading: "Loading…",
	saving: "Saving…",
	deleting: "Deleting…",
	retry: "Retry",
	error: "Error",
	search: "Search",
	settings: "Settings",
	more: "More",
	back: "Back",
	done: "Done",
	apply: "Apply",
	reset: "Reset",
	clear: "Clear",
	dismiss: "Dismiss",
	optional: "Optional",
	none: "None",
	all: "All",
	unknown: "Unknown",
	closeDialog: "Close dialog",
	closeAnnouncement: "Close announcement",
} as const;
