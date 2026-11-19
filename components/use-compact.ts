"use client";

import { useSyncExternalStore } from "react";

/** The compact layout: phone portrait, and coarse-pointer devices even after
 *  they rotate (a 432px-wide phone becomes ~980 CSS px in landscape). Desktop
 *  windows keep the full layout at any width — Electron has its own
 *  auto-close/expand behavior. */
const QUERY = "(max-width: 767px), (pointer: coarse) and (max-width: 1024px)";

let list: MediaQueryList | null = null;

function media(): MediaQueryList | null {
	if (typeof window === "undefined") return null;
	list ??= window.matchMedia(QUERY);
	return list;
}

export function isCompactViewport(): boolean {
	return media()?.matches ?? false;
}

export function useCompact(): boolean {
	return useSyncExternalStore(
		(onChange) => {
			const mql = media();
			if (!mql) return () => {};
			mql.addEventListener("change", onChange);
			return () => mql.removeEventListener("change", onChange);
		},
		() => media()?.matches ?? false,
		() => false,
	);
}
