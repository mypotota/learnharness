"use client";

/** Android's back button, handed to the web layer first. MainActivity calls
 *  `window.lhHandleNativeBack()`; the topmost registered overlay (drawer,
 *  settings) consumes the press and returns true, otherwise the shell falls
 *  back to history / exiting. Last registered wins. */
type Handler = () => boolean;

const handlers: Handler[] = [];

function publish() {
	if (typeof window === "undefined") return;
	if (handlers.length === 0) {
		delete window.lhHandleNativeBack;
		return;
	}
	window.lhHandleNativeBack = () => {
		for (let i = handlers.length - 1; i >= 0; i--) {
			const handler = handlers[i];
			if (handler?.()) return true;
		}
		return false;
	};
}

export function registerNativeBack(handler: Handler): () => void {
	handlers.push(handler);
	publish();
	return () => {
		const at = handlers.lastIndexOf(handler);
		if (at >= 0) handlers.splice(at, 1);
		publish();
	};
}

/* The interaction-layer rung: menus, popovers, dialogs, sheets and plugin
 * surfaces all register through useInteractionLayer, so one dismissTop covers
 * them. Registered right after the history rung (and therefore below any
 * surface-specific handler registered by a component) — a drawer or a settings
 * detail step still gets the press first. */
let closeTopLayer: (() => boolean) | null = null;

export function setNativeBackLayers(handler: (() => boolean) | null) {
	closeTopLayer = handler;
}

/* The last rung: in-app history. Android's WebView.canGoBack() does not see
 * client-side entries (Next's router pushes state without a document load),
 * so the native shell alone would exit from a session. The Navigation API
 * does see them — it walks one entry back, and at the real root returns
 * false so the shell exits like a native app. Registered at import time so
 * overlays (drawer, settings) always sit above it in the stack. */
type NavApi = { canGoBack: boolean; back: () => Promise<unknown> | void };

if (typeof window !== "undefined") {
	registerNativeBack(() => {
		const navigation = (window as Window & { navigation?: NavApi }).navigation;
		if (!navigation?.canGoBack) return false;
		void navigation.back();
		return true;
	});
	// Above history, below every later (surface-specific) registration.
	registerNativeBack(() => closeTopLayer?.() ?? false);
}

declare global {
	interface Window {
		lhHandleNativeBack?: () => boolean;
	}
}
