import { useSyncExternalStore } from "react";

/** Minimal history router used by the reused components' `next/navigation`
 *  imports. The mobile shell owns real routing in `src/app.tsx`; this module
 *  only keeps the shared components' `useRouter`/`usePathname` contracts. */

const listeners = new Set<() => void>();

/** How many in-app pushes sit above the entry the app booted on. The browser
 *  does not expose this (history.length never shrinks), so the router counts
 *  it; the Android back gesture uses it to decide "go back" vs "minimize". */
let depth = 0;

function emit() {
	for (const listener of listeners) listener();
}

export function navigate(to: string, replace = false) {
	if (typeof window === "undefined") return;
	if (replace) window.history.replaceState(null, "", to);
	else {
		window.history.pushState(null, "", to);
		depth += 1;
	}
	emit();
}

/** Whether a back gesture has an in-app entry to return to. */
export function canGoBack(): boolean {
	return depth > 0;
}

if (typeof window !== "undefined") {
	window.addEventListener("popstate", () => {
		depth = Math.max(0, depth - 1);
		emit();
	});
}

function subscribe(listener: () => void) {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

function snapshot() {
	return typeof window === "undefined" ? "/" : window.location.pathname;
}

export function usePathname(): string {
	return useSyncExternalStore(subscribe, snapshot, () => "/");
}

export function useSearchParams(): URLSearchParams {
	const search = useSyncExternalStore(
		subscribe,
		() => (typeof window === "undefined" ? "" : window.location.search),
		() => "",
	);
	return new URLSearchParams(search);
}

export function useRouter() {
	return {
		push: (to: string) => navigate(to),
		replace: (to: string) => navigate(to, true),
		back: () => window.history.back(),
		forward: () => window.history.forward(),
		refresh: () => emit(),
		prefetch: () => {},
	};
}
