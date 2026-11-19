/**
 * The mobile appearance provider. Same job as the desktop one — the active
 * theme's class and color variables on <html> — but reading the theme
 * modules directly instead of the core barrel, whose server-only modules
 * (node:crypto) must never enter the WebView bundle.
 *
 * P1 applies the theme palette only; the desktop's font/prose knobs come
 * with the on-device settings record in P2.
 */

import {
	createContext,
	useContext,
	useLayoutEffect,
	useMemo,
	useState,
	type ReactNode,
} from "react";
import {
	BUILTIN_THEMES,
	effectiveColors,
	resolveTheme,
	themeVars,
	type RenderedMode,
	type Theme,
	type ThemeColors,
} from "@/src/core/themes";
import type { AppearanceSettings } from "@/src/core/settings";

interface MobileAppearanceValue {
	/** The raw delta — what a theme switch composes onto. */
	delta: AppearanceSettings | undefined;
	/** The active theme (Default when the id is unknown). */
	activeTheme: Theme;
	/** The active theme's variant (the class on <html>). */
	resolvedMode: RenderedMode;
	/** The active theme with every override applied. */
	colors: ThemeColors;
	/** Built-in presets; custom imports arrive with P2. */
	themes: Theme[];
	onAppearanceChange: (delta: AppearanceSettings | undefined) => void;
}

const DEFAULT_THEME = resolveTheme(undefined);

const AppearanceContext = createContext<MobileAppearanceValue>({
	delta: undefined,
	activeTheme: DEFAULT_THEME,
	resolvedMode: DEFAULT_THEME.mode,
	colors: DEFAULT_THEME.colors,
	themes: [...BUILTIN_THEMES],
	onAppearanceChange: () => {},
});

export function useAppearance() {
	return useContext(AppearanceContext);
}

export function AppearanceProvider({
	initialAppearance,
	children,
}: {
	initialAppearance: AppearanceSettings | undefined;
	children: ReactNode;
}) {
	const [delta, setDelta] = useState<AppearanceSettings | undefined>(initialAppearance);
	const appearance = useMemo(() => resolveAppearance(delta), [delta]);
	const activeTheme = useMemo(() => resolveTheme(appearance.theme), [appearance.theme]);
	const colors = useMemo(() => effectiveColors(activeTheme, delta), [activeTheme, delta]);

	useLayoutEffect(() => {
		const root = document.documentElement;
		root.classList.toggle("dark", activeTheme.mode === "dark");
		root.classList.toggle("light", activeTheme.mode === "light");
		for (const [name, value] of Object.entries(themeVars(colors, activeTheme.mode))) {
			root.style.setProperty(name, value);
		}
	}, [activeTheme, colors]);

	const value = useMemo<MobileAppearanceValue>(
		() => ({
			delta,
			activeTheme,
			resolvedMode: activeTheme.mode,
			colors,
			themes: [...BUILTIN_THEMES],
			onAppearanceChange: setDelta,
		}),
		[delta, activeTheme, colors],
	);
	return <AppearanceContext.Provider value={value}>{children}</AppearanceContext.Provider>;
}

/** The theme id plus the record's own background override. */
function resolveAppearance(delta: AppearanceSettings | undefined): { theme: string | undefined } {
	return { theme: delta?.theme };
}
