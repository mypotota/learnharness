/**
 * THE SYNC-STATUS AREA: the top-bar sync control and its conflict dialog.
 * The Settings → Sync card keeps its own `settings.sync.*` keys.
 */

export const syncStatus = {
	action: "Sync now",
	label: "Sync status",
	never: "Not synced",
	syncing: "Syncing…",
	conflict: "Needs attention",
	issue: "Sync issue",
	unconfigured: "Sync is not set up.",
	upToDate: "Already in sync.",
	pushed: "Uploaded to the server.",
	pulled: "Downloaded from the server. Reloading…",
	busyTurn: "A teaching turn is running — try again later.",
	busyJob: "A background job is running — try again later.",
	failed: "Sync failed: {detail}",
	openSettings: "Open sync settings",
	more: "More",
	plan: "Plan",
	coverage: "Extraction coverage",
	phase: "Phase",
	usage: "Plan usage",
	pluginActions: "Plugin actions",
	conflictTitle: "Sync conflict",
	resolve: "Resolve conflict…",
	conflictKeepRemote: "Overwrite the server with this device",
	conflictKeepLocal: "Replace this device with the server",
	conflictLater: "Not now",
	conflictBackup: "This device's data was backed up to {path}.",
	conflictPushed: "The server was overwritten.",
	conflictPulled: "This device was replaced.",
	reload: "Reload",
} as const;
