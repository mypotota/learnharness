import { useSyncExternalStore } from "react";

/** Minimal history router used by the reused components' `next/navigation`
 *  imports. The mobile shell owns real routing in `src/app.tsx`; this module
 *  only keeps the shared components' `useRouter`/`usePathname` contracts. */

const listeners = new Set<() => void>();

function emit() {
	for (const listener of listeners) listener();
}

export function navigate(to: string, replace = false) {
	if (typeof window === "undefined") return;
	if (replace) window.history.replaceState(null, "", to);
	else window.history.pushState(null, "", to);
	emit();
}

if (typeof window !== "undefined") {
	window.addEventListener("popstate", emit);
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
