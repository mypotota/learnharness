/**
 * THE SIDEBAR AREA (i18n wave, 2026-11-19): the session list's own copy —
 * the frame's toggles, the list header, the kind filter and the session
 * row's meta line.
 *
 * The English text IS today's wording, exactly.
 */

export const sidebar = {
	openSidebar: "Open sidebar",
	closeSidebar: "Close sidebar",
	home: "Home",
	sessions: "Sessions",
	settings: "Settings",
	searchSessions: "Search sessions",
	searchPlaceholder: "Search…",
	teaching: "Teaching",
	practice: "Practice",
	all: "All",
	loading: "Loading…",
	noMatch: "No sessions match.",
	none: "No sessions yet.",
	rename: "Rename",
	renameSession: "Rename session",
	exportMarkdown: "Export as Markdown…",
	delete: "Delete…",
	practiceSession: "Practice session",
	newTeachingSession: "create a new teaching session",
	newPracticeSession: "create a new practice session",
	/** The row's second line — how long ago, and in what state. */
	timeJustNow: "just now",
	timeMinutes: "{count}m ago",
	timeHours: "{count}h ago",
	timeDays: "{count}d ago",
	metaCompacting: "Compacting context",
	metaWaiting: "Waiting for input",
	metaProblemWaiting: "Problem waiting",
	metaWorking: "Working…",
} as const;
