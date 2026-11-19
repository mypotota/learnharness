import type { Metadata } from "next";
import { JetBrains_Mono, Source_Sans_3 } from "next/font/google";
import { connection } from "next/server";
import "katex/dist/katex.min.css";
import "./globals.css";
import { AppShell, SidebarProvider } from "@/components/sidebar";
import { ActivityProvider } from "@/components/activity-dock";
import { ServerEventsProvider } from "@/components/server-events";
import { AppearanceProvider } from "@/components/settings/appearance";
import { I18nProvider } from "@/components/i18n/i18n-provider";
import UpdateBanner from "@/components/update-banner";
import { SafeAreaSync } from "@/components/safe-area";
import { PluginsProvider } from "@/components/plugins";
import { readLocaleBoot, readThemeBoot } from "@/src/server";

// Chrome = JetBrains Mono, teaching prose = Source Sans 3, titles = CMU
// Serif (the bundled lh-cmu @font-face in globals.css — no CDN).
const ui = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains" });
const prose = Source_Sans_3({ subsets: ["latin"], variable: "--font-sans3" });

export const metadata: Metadata = {
	title: "Learning Harness",
	description: "A teacher agent with a memory — sessions, quizzes, and a knowledge graph of what you know.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
	// The theme is server-rendered — its class AND its color variables —
	// so no first frame ever shows the wrong theme. connection(): the
	// record and the theme files are per-machine disk state — without it a
	// prerendered route (settings) would bake the BUILD machine's record.
	await connection();
	const { appearance, theme, vars } = readThemeBoot();
	// The language for the FIRST PAINT: the record's explicit choice, else
	// the request's language, else English (i18n wave, 2026-11-19).
	const { locale, explicit } = await readLocaleBoot();
	return (
		<html
			lang={locale}
			className={`${theme.mode} ${ui.variable} ${prose.variable}`}
			style={vars as React.CSSProperties}
			suppressHydrationWarning
		>
			<body className="min-h-dvh antialiased">
			{/* The language provider rides OUTSIDE everything: every surface
				 reads its wording through useT(), and a surface rendered
				 without one falls back to English. */}
			<I18nProvider initialLocale={locale} initialExplicit={explicit}>
				{/* Android hands the system-bar insets to this component once the
				    first route mounts (see SafeAreaSync). */}
				<SafeAreaSync />
				{/* The notification channel rides OUTSIDE everything: sidebar, dock,
					 and pages all subscribe as the polls retire (push S3, 2026-10-02). */}
				<ServerEventsProvider>
					<PluginsProvider>
						<AppearanceProvider initialAppearance={appearance} initialTheme={theme}>
							<SidebarProvider>
								<ActivityProvider>
									<AppShell>{children}</AppShell>
								</ActivityProvider>
							</SidebarProvider>
						</AppearanceProvider>
					</PluginsProvider>
				</ServerEventsProvider>
				{/* Auto-update banner (Wave C): fixed card, Electron-only pushes. */}
				<UpdateBanner />
			</I18nProvider>
		</body>
		</html>
	);
}
