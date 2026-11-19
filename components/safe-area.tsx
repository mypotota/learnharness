"use client";

import { useEffect } from "react";

/**
 * Android WebView draws edge-to-edge, so the status bar and gesture bar sit on
 * top of the page. Their size differs per device (and rotates), which no CSS
 * media query can express, so MainActivity hands the insets over in CSS
 * pixels: the page pulls them once on mount through LhChrome.getSafeArea()
 * and the shell pushes later changes into window.LhApplySafeArea.
 *
 * Consumers read --lh-safe-top / --lh-safe-right / --lh-safe-bottom /
 * --lh-safe-left (0px everywhere else, e.g. the browser and Electron).
 */
function setVar(name: string, value: number) {
	document.documentElement.style.setProperty(name, `${value}px`);
}

export function applySafeArea(csv: string) {
	const parts = csv.split(",").map((part) => Number.parseFloat(part) || 0);
	setVar("--lh-safe-top", parts[0] ?? 0);
	setVar("--lh-safe-right", parts[1] ?? 0);
	setVar("--lh-safe-bottom", parts[2] ?? 0);
	setVar("--lh-safe-left", parts[3] ?? 0);
}

/** Mount once, above every surface that insets its chrome. */
export function SafeAreaSync() {
	useEffect(() => {
		const chrome = (window as unknown as { LhChrome?: { getSafeArea?: () => string } }).LhChrome;
		if (chrome?.getSafeArea) applySafeArea(chrome.getSafeArea());
		window.LhApplySafeArea = applySafeArea;
		return () => {
			delete window.LhApplySafeArea;
		};
	}, []);
	return null;
}

declare global {
	interface Window {
		LhApplySafeArea?: (csv: string) => void;
	}
}
