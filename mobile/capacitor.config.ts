import type { CapacitorConfig } from "@capacitor/cli";

/** Android-only P0 shell. `webDir` is the Vite output. The http scheme keeps
 *  local loopback/spike endpoints reachable during validation; production
 *  model calls are https and the in-app proxy will move to the same policy. */
const config: CapacitorConfig = {
	appId: "ai.learnharness.mobile",
	appName: "LearnHarness",
	webDir: "dist",
	server: {
		androidScheme: "http",
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
