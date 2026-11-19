/**
 * The Electron preload bridge the desktop declares in components/sidebar.tsx.
 * The mobile build imports two desktop components (the plan diagram and its
 * i18n hook), which read `window.lh` optionally; this keeps those files
 * type-checking without pulling the whole desktop shell into the graph.
 */

export {};

declare global {
	interface Window {
		lh?: {
			locale?: () => Promise<string>;
			menuLocale?: (locale: "en" | "zh-CN") => void;
		};
	}
}
