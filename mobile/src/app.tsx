import { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { App as CapacitorApp } from "@capacitor/app";
import { StatusBar, Style } from "@capacitor/status-bar";
import { readBootAppearance } from "./appearance-boot";
import { bootEngine } from "./engine/boot";
import { AppearanceProvider, useAppearance } from "./platform/appearance-provider";
import { ChatPage } from "./pages/chat";
import { DraftPage, HomePage } from "./pages/home";
import { SettingsPage } from "./pages/settings";
import { I18nProvider, readBootLocale } from "./platform/i18n-provider";
import { canGoBack, navigate, usePathname } from "./platform/next-navigation";
import { runBackHandlers } from "./platform/back";
import { MobileShell } from "./shell";
import { useSession } from "./store";

function Route({ pathname }: { pathname: string }) {
	if (pathname === "/settings") return <SettingsPage />;
	if (pathname === "/chat/new") return <DraftPage />;
	if (pathname.startsWith("/chat/")) {
		const id = decodeURIComponent(pathname.slice("/chat/".length));
		return <ChatPage sessionId={id} />;
	}
	return <HomePage />;
}

/** Light themes need dark status-bar glyphs, dark themes light ones. */
function StatusBarSync() {
	const { resolvedMode } = useAppearance();
	useEffect(() => {
		if (!Capacitor.isNativePlatform()) return;
		void StatusBar.setStyle({ style: resolvedMode === "dark" ? Style.Light : Style.Dark }).catch(() => {});
	}, [resolvedMode]);
	return null;
}

/** Android's back gesture and back button, in order: close the topmost
 *  sheet, walk router history, and finally send the app to the background
 *  (the user's chosen root behavior — sessions survive). */
function BackGestureSync() {
	useEffect(() => {
		if (!Capacitor.isNativePlatform()) return;
		let disposed = false;
		let remove: (() => void) | undefined;
		void CapacitorApp.addListener("backButton", () => {
			if (runBackHandlers()) return;
			if (canGoBack()) {
				window.history.back();
				return;
			}
			if (window.location.pathname !== "/") {
				navigate("/", true);
				return;
			}
			void CapacitorApp.minimizeApp();
		}).then((handle) => {
			if (disposed) void handle.remove();
			else remove = () => void handle.remove();
		});
		return () => {
			disposed = true;
			remove?.();
		};
	}, []);
	return null;
}

export function App() {
	const pathname = usePathname();
	const [appearance] = useState(() => readBootAppearance());
	const [locale] = useState(() => readBootLocale());

	useEffect(() => {
		// Start the native proxy before any model fetch and warm the catalogs
		// while the shell renders. A failure surfaces on the first send.
		void bootEngine().catch(() => {});
	}, []);

	const chatId =
		pathname.startsWith("/chat/") && pathname !== "/chat/new"
			? decodeURIComponent(pathname.slice("/chat/".length))
			: "";
	const session = useSession(chatId);

	return (
		<I18nProvider initialLocale={locale} initialExplicit={locale}>
			<AppearanceProvider initialAppearance={appearance}>
				<StatusBarSync />
				<BackGestureSync />
				<MobileShell sessionTitle={session?.title}>
					<Route key={pathname} pathname={pathname} />
				</MobileShell>
			</AppearanceProvider>
		</I18nProvider>
	);
}
