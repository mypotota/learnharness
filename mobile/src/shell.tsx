import { useEffect, useState, type ReactNode } from "react";
import {
	ArrowLeftIcon,
	DumbbellIcon,
	MenuIcon,
	PlusIcon,
	SearchIcon,
	SettingsIcon,
	XIcon,
} from "lucide-react";
import { LhMark } from "@/components/lh-mark";
import { cn } from "@/lib/utils";
import { useT } from "./platform/i18n-provider";
import { navigate, usePathname } from "./platform/next-navigation";
import { useSessions, type MobileSession } from "./store";
import { MOBILE_STRINGS } from "./strings";
import { useI18n } from "./platform/i18n-provider";

/** "how long ago" on the drawer rows — the desktop sidebar's wording. */
function timeAgo(iso: string, t: ReturnType<typeof useT>): string {
	const ms = Date.now() - new Date(iso).getTime();
	if (ms < 60_000) return t("sidebar.timeJustNow");
	const min = Math.floor(ms / 60_000);
	if (min < 60) return t("sidebar.timeMinutes", { count: min });
	const h = Math.floor(min / 60);
	if (h < 24) return t("sidebar.timeHours", { count: h });
	const d = Math.floor(h / 24);
	if (d < 7) return t("sidebar.timeDays", { count: d });
	const date = new Date(iso);
	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function SessionRow({ session, active, onOpen }: { session: MobileSession; active: boolean; onOpen: () => void }) {
	const t = useT();
	return (
		<button
			type="button"
			onClick={onOpen}
			className={cn(
				"flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left transition-colors active:bg-accent",
				active ? "bg-accent" : "hover:bg-accent/60",
			)}
		>
			<span className="min-w-0 flex-1">
				<span className="block truncate font-prose text-(length:--lh-prose-size) leading-snug">
					{session.title}
				</span>
				<span className="mt-0.5 block truncate text-xs text-muted-foreground">
					{timeAgo(session.updatedAt, t)}
				</span>
			</span>
			{session.kind === "practice" && (
				<DumbbellIcon className="size-3.5 shrink-0 text-muted-foreground/70" aria-label={t("sidebar.practiceSession")} />
			)}
		</button>
	);
}

function Drawer({ open, onClose }: { open: boolean; onClose: () => void }) {
	const t = useT();
	const { locale } = useI18n();
	const strings = MOBILE_STRINGS[locale];
	const sessions = useSessions();
	const pathname = usePathname();
	const [query, setQuery] = useState("");

	const filtered = [...sessions]
		.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
		.filter((session) => session.title.toLowerCase().includes(query.trim().toLowerCase()));

	const go = (to: string) => {
		onClose();
		navigate(to);
	};

	return (
		<div className={cn("fixed inset-0 z-50", open ? "pointer-events-auto" : "pointer-events-none")} aria-hidden={!open}>
			<button
				type="button"
				tabIndex={open ? 0 : -1}
				aria-label={t("common.close")}
				onClick={onClose}
				className={cn(
					"absolute inset-0 bg-black/45 transition-opacity duration-200",
					open ? "opacity-100" : "opacity-0",
				)}
			/>
			<aside
				role="dialog"
				aria-modal="true"
				aria-label={strings.drawerSessions}
				className={cn(
					"lh-drawer absolute inset-y-0 left-0 flex w-[85%] max-w-xs flex-col border-r border-border bg-card shadow-2xl transition-transform duration-200 ease-out",
					open ? "translate-x-0" : "-translate-x-full",
				)}
			>
				<div className="flex items-center gap-2 px-4 pb-2 pt-3">
					<LhMark className="size-7" />
					<span className="min-w-0 flex-1 truncate font-title text-lg font-bold">LearnHarness</span>
					<button type="button" onClick={onClose} aria-label={t("common.close")} className="lh-touch -mr-1 rounded-lg text-muted-foreground">
						<XIcon className="size-5" />
					</button>
				</div>

				<div className="px-3 pb-2">
					<button
						type="button"
						onClick={() => go("/chat/new")}
						className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-3 py-2.5 text-sm font-medium text-primary-foreground active:opacity-90"
					>
						<PlusIcon className="size-4" />
						{strings.newSession}
					</button>
				</div>

				<div className="px-3 pb-2">
					<label className="flex items-center gap-2 rounded-lg border border-border/70 bg-background/60 px-2.5">
						<SearchIcon className="size-4 shrink-0 text-muted-foreground" />
						<input
							value={query}
							onChange={(event) => setQuery(event.target.value)}
							placeholder={t("sidebar.searchPlaceholder")}
							aria-label={t("sidebar.searchSessions")}
							className="h-10 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
						/>
					</label>
				</div>

				<div className="lh-scroll min-h-0 flex-1 overflow-y-auto px-2 pb-2">
					<div className="px-1 pb-1 pt-2 font-ui text-[11px] uppercase tracking-wider text-muted-foreground">
						{strings.drawerSessions}
					</div>
					{filtered.length === 0 ? (
						<p className="px-2 py-6 text-center text-sm text-muted-foreground">
							{query.trim() ? t("sidebar.noMatch") : strings.noSessions}
						</p>
					) : (
						filtered.map((session) => (
							<SessionRow
								key={session.id}
								session={session}
								active={pathname === `/chat/${session.id}`}
								onOpen={() => go(`/chat/${session.id}`)}
							/>
						))
					)}
				</div>

				<div className="lh-safe-bottom border-t border-border/60 p-2">
					<button
						type="button"
						onClick={() => go("/settings")}
						className={cn(
							"flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm active:bg-accent",
							pathname === "/settings" && "bg-accent",
						)}
					>
						<SettingsIcon className="size-4 text-muted-foreground" />
						{t("settings.title")}
					</button>
				</div>
			</aside>
		</div>
	);
}

/** The frame: a route-aware top bar, an overlay drawer, and the page column. */
export function MobileShell({ children, sessionTitle }: { children: ReactNode; sessionTitle?: string }) {
	const t = useT();
	const { locale } = useI18n();
	const strings = MOBILE_STRINGS[locale];
	const pathname = usePathname();
	const [drawerOpen, setDrawerOpen] = useState(false);

	// Any navigation dismisses the drawer.
	useEffect(() => {
		setDrawerOpen(false);
	}, [pathname]);

	// The drawer owns the page's scroll while it is open.
	useEffect(() => {
		const root = document.documentElement;
		if (drawerOpen) root.classList.add("lh-no-scroll");
		else root.classList.remove("lh-no-scroll");
		return () => root.classList.remove("lh-no-scroll");
	}, [drawerOpen]);

	// The drawer is dismissed by Escape on a hardware keyboard; Android's
	// back gesture pops the WebView history (the drawer is not a history
	// entry, so it closes on any navigation instead).
	useEffect(() => {
		if (!drawerOpen) return;
		const onKey = (event: KeyboardEvent) => {
			if (event.key === "Escape") setDrawerOpen(false);
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [drawerOpen]);

	const isHome = pathname === "/";
	const isSettings = pathname === "/settings";
	const isChat = pathname.startsWith("/chat/");

	const title = isSettings ? t("settings.title") : isChat ? sessionTitle ?? t("chat.newSession") : undefined;

	return (
		<div className="flex h-dvh flex-col overflow-hidden bg-background text-foreground">
			<header className="lh-safe-top z-30 shrink-0 border-b border-border/60 bg-background/95">
				<div className="flex h-12 items-center gap-1 px-2">
					{isHome ? (
						<button
							type="button"
							onClick={() => setDrawerOpen(true)}
							aria-label={t("sidebar.openSidebar")}
							className="lh-touch rounded-lg text-foreground active:bg-accent"
						>
							<MenuIcon className="size-5" />
						</button>
					) : (
						<button
							type="button"
							onClick={() => navigate("/")}
							aria-label={t("common.back")}
							className="lh-touch rounded-lg text-foreground active:bg-accent"
						>
							<ArrowLeftIcon className="size-5" />
						</button>
					)}

					<div className="flex min-w-0 flex-1 items-center gap-2">
						{isHome ? (
							<>
								<LhMark className="size-6 shrink-0" />
								<span className="truncate font-title text-base font-bold">LearnHarness</span>
							</>
						) : (
							<h1 className="truncate font-title text-base font-semibold">{title}</h1>
						)}
					</div>

					{isHome && (
						<button
							type="button"
							onClick={() => navigate("/settings")}
							aria-label={t("sidebar.settings")}
							className="lh-touch rounded-lg text-muted-foreground active:bg-accent"
						>
							<SettingsIcon className="size-5" />
						</button>
					)}
					{isChat && (
						<button
							type="button"
							onClick={() => setDrawerOpen(true)}
							aria-label={t("sidebar.openSidebar")}
							className="lh-touch rounded-lg text-muted-foreground active:bg-accent"
						>
							<MenuIcon className="size-5" />
						</button>
					)}
					{(isSettings || (!isHome && !isChat)) && <span className="size-11" aria-hidden="true" />}
				</div>
			</header>

			<Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />

			<main className="flex min-h-0 flex-1 flex-col">{children}</main>
		</div>
	);
}
