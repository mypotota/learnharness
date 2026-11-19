/**
 * THE CHAINS AREA (i18n wave, 2026-11-19): the reasoning-chain table's
 * own copy — the header, the tree columns, the selection bar and the
 * practice picker chrome.
 *
 * The English text IS today's wording, exactly.
 */

export const chains = {
	addFolder: "Add folder",
	searchLabel: "Search nodes",
	searchPlaceholder: "Search nodes…",
	closeChains: "Close chains",
	summary: "{chains, plural, one {# chain} other {# chains}} · {nodes, plural, one {# node} other {# nodes}}",
	name: "Name",
	props: "Props",
	created: "Created",
	noMatch: "No matching chains.",
	notes: "notes",
	unlabeled: "unlabeled",
	selectSource: "Select source {name}",
	selectBorn: "Select everything born in {name}",
	expandCluster: "Expand cluster {name}",
	expandSource: "Expand source {name}",
	clear: "Clear",
	delete: "Delete",
	deleteSelected: "Delete selected sources and folders",
	done: "Done",
	donePicking: "Done picking — {count, plural, one {# proposition} other {# propositions}} selected",
	selectionSummary: "{nodes, plural, one {# node} other {# nodes}} → {chains, plural, one {# chain} other {# chains}}",
	sourcesSummary: "{sources, plural, one {# source} other {# sources}}",
	foldersSuffix: "· {folders, plural, one {# folder} other {# folders}}",
} as const;
