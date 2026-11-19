import type { CapacitorConfig } from "@capacitor/cli";

/** The WebView is a window onto the desktop standalone server that
 *  ServerRuntime.java starts on loopback; `server.url` points the app origin
 *  there directly. allowNavigation keeps loopback aliases inside the WebView
 *  (and lets Bridge.launchIntent send every other host to the system
 *  browser). The product surface is the served app — the Capacitor webDir
 *  assets are never navigated to. */
const config: CapacitorConfig = {
	appId: "ai.learnharness.mobile",
	appName: "LearnHarness",
	webDir: "dist",
	server: {
		androidScheme: "http",
		url: "http://127.0.0.1:41100/",
		allowNavigation: ["127.0.0.1", "localhost"],
	},
	android: {
		allowMixedContent: true,
	},
	plugins: {
		// Android 15 is edge-to-edge, where windowSoftInputMode alone no
		// longer shrinks the WebView. The plugin applies the IME inset so the
		// shell keeps its header while the composer sits above the keyboard.
		Keyboard: {
			resize: "native",
			resizeOnFullScreen: true,
		},
	},
};

export default config;
