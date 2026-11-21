/** Plugins use the documented per-server initialization hook. A plugin failure
 * must not prevent access to existing learning data or teaching/practice. */
export async function register() {
	if (process.env.NEXT_RUNTIME === "nodejs") {
		const { initializePlugins } = await import("./src/server/plugins.ts");
		try { await initializePlugins(); }
		catch (error) { console.error("[plugins] Initialization failed; plugin management will report the error:", error); }
		// The automatic WebDAV check (webdav-sync wave): a process-wide loop
		// that no-ops until Settings → Sync is configured and enabled.
		const { startAutoSyncLoop } = await import("./src/server/sync/service.ts");
		try { startAutoSyncLoop(); }
		catch (error) { console.error("[sync] Automatic sync loop failed to start:", error); }
	}
}
