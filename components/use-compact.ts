"use client";

import { useSyncExternalStore } from "react";

/** The compact layout: phone portrait, and coarse-pointer devices even after
 *  they rotate (a 432px-wide phone becomes ~980 CSS px in landscape). Desktop
 *  windows keep the full layout at any width — Electron has its own
 *  auto-close/expand behavior. */
const QUERY = "(max-width: 767px), (pointer: coarse) and (max-width: 1024px)";

/** A touch screen with room for a persistent sidebar beside a single
 *  reading column: the unfolded foldable (≈692×763 CSS on the Find N5),
 *  tablets and landscape phones tall enough to hold the list. Below these
 *  numbers the same screen keeps the phone drawer, where a 288px sidebar
 *  would eat most of the width. */
const SPLIT_QUERY = "(pointer: coarse) and (min-width: 640px) and (min-height: 560px)";

function query(search: string, cache: { list: MediaQueryList | null }): MediaQueryList | null {
	if (typeof window === "undefined") return null;
	cache.list ??= window.matchMedia(search);
	return cache.list;
}

const compactCache = { list: null as MediaQueryList | null };
const splitCache = { list: null as MediaQueryList | null };

function media(): MediaQueryList | null {
	return query(QUERY, compactCache);
}

function splitMedia(): MediaQueryList | null {
	return query(SPLIT_QUERY, splitCache);
}

export function isCompactViewport(): boolean {
	return media()?.matches ?? false;
}

export function isSplitShellViewport(): boolean {
	return splitMedia()?.matches ?? false;
}

function subscribe(mql: MediaQueryList | null, onChange: () => void) {
	if (!mql) return () => {};
	mql.addEventListener("change", onChange);
	return () => mql.removeEventListener("change", onChange);
}

export function useCompact(): boolean {
	return useSyncExternalStore(
		(onChange) => subscribe(media(), onChange),
		() => media()?.matches ?? false,
		() => false,
	);
}

/** True when the sidebar should stay inline (rail or full) instead of
 *  becoming a drawer — see SPLIT_QUERY. */
export function useSplitShell(): boolean {
	return useSyncExternalStore(
		(onChange) => subscribe(splitMedia(), onChange),
		() => splitMedia()?.matches ?? false,
		() => false,
	);
}
