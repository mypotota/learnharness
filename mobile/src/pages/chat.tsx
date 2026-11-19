import { useEffect, useRef, useState } from "react";
import { LhMark } from "@/components/lh-mark";
import { MobileComposer } from "../components/composer";
import { useI18n, useT } from "../platform/i18n-provider";
import { navigate } from "../platform/next-navigation";
import { appendMessage, useSession } from "../store";
import { MOBILE_STRINGS } from "../strings";

/** `/chat/:id` — a transcript plus the pinned composer. */
export function ChatPage({ sessionId }: { sessionId: string }) {
	const t = useT();
	const { locale } = useI18n();
	const strings = MOBILE_STRINGS[locale];
	const session = useSession(sessionId);
	const [text, setText] = useState("");
	const scrollRef = useRef<HTMLDivElement>(null);

	const messages = session?.messages ?? [];

	useEffect(() => {
		const el = scrollRef.current;
		if (el) el.scrollTop = el.scrollHeight;
	}, [messages.length]);

	if (!session) {
		return (
			<div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center">
				<LhMark className="size-10 opacity-60" />
				<h2 className="font-title text-lg font-semibold">{strings.notFoundTitle}</h2>
				<p className="text-sm text-muted-foreground">{strings.notFoundDescription}</p>
				<button
					type="button"
					onClick={() => navigate("/")}
					className="mt-2 rounded-lg border border-border px-4 py-2 text-sm active:bg-accent"
				>
					{strings.backHome}
				</button>
			</div>
		);
	}

	const send = () => {
		const draft = text.trim();
		if (!draft) return;
		appendMessage(session.id, "user", draft);
		setText("");
		window.setTimeout(() => appendMessage(session.id, "assistant", strings.demoReply), 700);
	};

	return (
		<div className="flex h-full flex-col">
			<div ref={scrollRef} className="lh-scroll min-h-0 flex-1 overflow-y-auto px-4 py-4">
				{messages.length === 0 ? (
					<p className="mt-10 text-center text-sm text-muted-foreground">{strings.emptyChat}</p>
				) : (
					<div className="flex flex-col gap-5">
						{messages.map((message) =>
							message.role === "user" ? (
								<div key={message.id} className="flex justify-end">
									<div className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-secondary px-3.5 py-2.5 text-sm leading-relaxed text-secondary-foreground">
										{message.text}
									</div>
								</div>
							) : (
								<div key={message.id} className="flex gap-2.5">
									<LhMark className="mt-0.5 size-5 shrink-0 opacity-80" />
									<div className="min-w-0 flex-1 whitespace-pre-wrap break-words font-prose text-(length:--lh-prose-size) leading-relaxed">
										{message.text}
									</div>
								</div>
							),
						)}
					</div>
				)}
			</div>

			<div className="lh-safe-bottom shrink-0 border-t border-border/60 bg-background px-3 pb-2 pt-2">
				<MobileComposer value={text} onChange={setText} onSend={send} placeholder={t("composer.placeholder")} />
			</div>
		</div>
	);
}
