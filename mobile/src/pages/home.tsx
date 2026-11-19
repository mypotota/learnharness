import { useState } from "react";
import { ArrowUpRightIcon, BookOpenIcon, DumbbellIcon } from "lucide-react";
import { MobileComposer } from "../components/composer";
import { useT, useI18n } from "../platform/i18n-provider";
import { navigate } from "../platform/next-navigation";
import { appendMessage, createSession, useSessions, type SessionKind } from "../store";
import { MOBILE_STRINGS } from "../strings";
import { cn } from "@/lib/utils";

function ModeSwitch({ mode, onChange }: { mode: SessionKind; onChange: (mode: SessionKind) => void }) {
	const t = useT();
	return (
		<div className="inline-flex rounded-full border border-border/70 bg-card p-0.5" role="group" aria-label="session kind">
			{(["teach", "practice"] as const).map((kind) => (
				<button
					key={kind}
					type="button"
					onClick={() => onChange(kind)}
					aria-pressed={mode === kind}
					className={cn(
						"flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
						mode === kind ? "bg-accent text-accent-foreground" : "text-muted-foreground",
					)}
				>
					{kind === "teach" ? <BookOpenIcon className="size-3.5" /> : <DumbbellIcon className="size-3.5" />}
					{kind === "teach" ? t("sidebar.teaching") : t("sidebar.practice")}
				</button>
			))}
		</div>
	);
}

function useStartSession() {
	const { locale } = useI18n();
	const strings = MOBILE_STRINGS[locale];
	return (text: string, kind: SessionKind) => {
		const session = createSession(text, kind);
		navigate(`/chat/${session.id}`);
		// P1 demo: a reply lands after the navigation so the transcript shows
		// both roles. P2 replaces this with the streamed turn.
		window.setTimeout(() => appendMessage(session.id, "assistant", strings.demoReply), 700);
	};
}

/** `/` — the mobile home: a greeting, the new-session composer, and the
 *  few most recent sessions. */
export function HomePage() {
	const t = useT();
	const { locale } = useI18n();
	const strings = MOBILE_STRINGS[locale];
	const sessions = useSessions();
	const start = useStartSession();
	const [text, setText] = useState("");
	const [mode, setMode] = useState<SessionKind>("teach");

	const recent = [...sessions].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 3);

	const send = () => {
		const draft = text.trim();
		if (!draft) return;
		start(draft, mode);
		setText("");
	};

	return (
		<div className="lh-scroll h-full overflow-y-auto">
			<div className="px-4 pb-5 pt-7">
				<h2 className="font-title text-2xl font-bold leading-tight">{strings.homeTitle}</h2>
				<p className="mt-2 text-sm leading-relaxed text-muted-foreground">{strings.homeSubtitle}</p>
				<div className="mt-4">
					<ModeSwitch mode={mode} onChange={setMode} />
				</div>
				<MobileComposer
					className="mt-3"
					value={text}
					onChange={setText}
					onSend={send}
					placeholder={mode === "practice" ? t("composer.practicePlaceholder") : t("composer.learnPlaceholder")}
				/>
			</div>

			<div className="px-4 pb-6">
				<h3 className="mb-2 font-ui text-[11px] uppercase tracking-wider text-muted-foreground">{strings.recent}</h3>
				{recent.length === 0 ? (
					<p className="rounded-xl border border-dashed border-border/70 px-3 py-6 text-center text-sm text-muted-foreground">
						{strings.noSessions}
					</p>
				) : (
					<ul className="overflow-hidden rounded-xl border border-border/70 bg-card/50">
						{recent.map((session) => (
							<li key={session.id} className="border-b border-border/60 last:border-b-0">
								<button
									type="button"
									onClick={() => navigate(`/chat/${session.id}`)}
									className="flex w-full items-center gap-2 px-3 py-3 text-left active:bg-accent"
								>
									{session.kind === "practice" ? (
										<DumbbellIcon className="size-4 shrink-0 text-muted-foreground/70" />
									) : (
										<BookOpenIcon className="size-4 shrink-0 text-muted-foreground/70" />
									)}
									<span className="min-w-0 flex-1 truncate font-prose text-(length:--lh-prose-size)">
										{session.title}
									</span>
									<ArrowUpRightIcon className="size-4 shrink-0 text-muted-foreground/50" />
								</button>
							</li>
						))}
					</ul>
				)}
			</div>
			<div className="lh-safe-bottom" />
		</div>
	);
}

/** `/chat/new` — the sessionless draft, matching the desktop contract: the
 *  session is created only when the first message is sent. */
export function DraftPage() {
	const t = useT();
	const { locale } = useI18n();
	const strings = MOBILE_STRINGS[locale];
	const start = useStartSession();
	const [text, setText] = useState("");
	const [mode, setMode] = useState<SessionKind>("teach");

	const send = () => {
		const draft = text.trim();
		if (!draft) return;
		start(draft, mode);
		setText("");
	};

	return (
		<div className="flex h-full flex-col">
			<div className="lh-scroll min-h-0 flex-1 overflow-y-auto px-4 pb-4 pt-5">
				<ModeSwitch mode={mode} onChange={setMode} />
				<p className="mt-6 text-sm leading-relaxed text-muted-foreground">
					{mode === "practice" ? t("chat.practiceEmptyDescription") : t("chat.emptyDescription")}
				</p>
			</div>
			<div className="lh-safe-bottom shrink-0 border-t border-border/60 bg-background px-3 pb-2 pt-2">
				<MobileComposer
					value={text}
					onChange={setText}
					onSend={send}
					autoFocus
					placeholder={mode === "practice" ? t("composer.practicePlaceholder") : t("composer.learnPlaceholder")}
				/>
			</div>
		</div>
	);
}
