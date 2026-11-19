/**
 * THE PLUGINS AREA (i18n wave, 2026-11-19): the host chrome around plugin
 * surfaces — the graph action dock, the overflow menu, the plugin view
 * screen, and the knowledge picker's graph read failure. Plugin-authored
 * copy is NOT here: plugins localize themselves (the stage-4 translation
 * API); the host renders their labels as given.
 */

export const plugins = {
	moreActions: "More plugin actions",
	graphActions: "Plugin graph actions",
	backToHome: "Back to home",
	loading: "Loading plugin…",
	settings: "Plugin settings",
	fallbackTitle: "Plugin",
	notInstalled: "Plugin is not installed.",
	disabled: "This plugin is disabled.",
	viewUnavailable: "This plugin view is not available.",
	graphReadFailed: "Could not read knowledge graph.",
} as const;
