import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { LhMark } from "@/components/lh-mark";
import { MobileComposer } from "../components/composer";
import { Markdown } from "../components/markdown";
import { useI18n, useT } from "../platform/i18n-provider";
import { navigate } from "../platform/next-navigation";
import { appendMessage, useSession, type MessageRole } from "../store";
import { MOBILE_STRINGS } from "../strings";
import { bootEngine } from "../engine/boot";
import { mobileSystemPrompt } from "../engine/prompt";
import {
	findModel,
	modelsVersion,
	selectedModel,
	streamReply,
	subscribeModels,
	type ChatTurn,
} from "../engine/registry";

/** `/chat/:id` — a transcript plus the pinned composer. */
export function ChatPage({ sessionId }: { sessionId: string }) {
	const t = useT();
	const { locale } = useI18n();
	const strings = MOBILE_STRINGS[locale];
	const session = useSession(sessionId);
	const [text, setText] = useState("");
	const [streamingText, setStreamingText] = useState("");
	const [thinkingText, setThinkingText] = useState("");
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const scrollRef = useRef<HTMLDivElement>(null);
	const abortRef = useRef<AbortController | null>(null);
	const retryRef = useRef<ChatTurn[] | null>(null);
	// The state copy lags by a render; the ref always holds the latest delta
	// so an abort can still save the partial reply.
	const streamingTextRef = useRef("");

	// The engine publishes registry changes (key saved, model picked) so the
	// composer can react without polling.
	useSyncExternalStore(subscribeModels, modelsVersion, modelsVersion);
	const target = selectedModel();
	const targetModel = target ? findModel(target) : undefined;

	const messages = session?.messages ?? [];
	const messageCount = messages.length;

	useEffect(() => {
		// Follow the reply as it streams; layout work is cheap here because
		// only the last bubble changes.
		const el = scrollRef.current;
		if (el) el.scrollTop = el.scrollHeight;
	}, [messageCount, streamingText, thinkingText, error]);

	useEffect(() => {
		return () => abortRef.current?.abort();
	}, []);

	const runTurn = async (history: ChatTurn[]) => {
		if (!session) return;
		const ref = selectedModel();
		if (!ref || !findModel(ref)) {
			setError(strings.modelRequired);
			return;
		}
		retryRef.current = history;
		const controller = new AbortController();
		abortRef.current = controller;
		setBusy(true);
		setError(null);
		setThinkingText("");
		setStreamingText("");
		streamingTextRef.current = "";
		try {
			await bootEngine();
			const reply = await streamReply(ref, mobileSystemPrompt(session.kind), history, controller.signal, {
				onText: (value) => {
					streamingTextRef.current = value;
					setStreamingText(value);
				},
				onThinking: setThinkingText,
			});
			if (reply.text.trim()) {
				appendMessage(session.id, "assistant", reply.text);
			} else if (!controller.signal.aborted) {
				setError(strings.chatError);
			}
		} catch (failure) {
			if (controller.signal.aborted) {
				const partial = streamingTextRef.current.trim();
				if (partial) appendMessage(session.id, "assistant", partial);
			} else {
				setError(failure instanceof Error ? failure.message : strings.chatError);
			}
		} finally {
			abortRef.current = null;
			setBusy(false);
			setStreamingText("");
			setThinkingText("");
		}
	};

	// A session created from Home starts its first turn here; the flag is
	// consumed once so re-renders and remounts never replay it.
	useEffect(() => {
		if (!session) return;
		const key = `lh:mobile:auto:${session.id}`;
		try {
			if (sessionStorage.getItem(key) !== "1") return;
			sessionStorage.removeItem(key);
		} catch {
			return;
		}
		const history = session.messages.map((message) => ({ role: message.role as MessageRole, text: message.text }));
		if (history.length > 0 && !history.some((turn) => turn.role === "assistant")) void runTurn(history);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [session?.id]);

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
		if (!draft || busy) return;
		const history: ChatTurn[] = [
			...messages.map((message) => ({ role: message.role as MessageRole, text: message.text })),
			{ role: "user", text: draft },
		];
		appendMessage(session.id, "user", draft);
		setText("");
		void runTurn(history);
	};

	const stop = () => abortRef.current?.abort();

	const retry = () => {
		if (retryRef.current) void runTurn(retryRef.current);
	};

	return (
		<div className="flex h-full flex-col">
			<div ref={scrollRef} className="lh-scroll min-h-0 flex-1 overflow-y-auto px-4 py-4">
				{messages.length === 0 && !busy ? (
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
									<div className="min-w-0 flex-1 font-prose text-(length:--lh-prose-size) leading-relaxed">
										<Markdown text={message.text} />
									</div>
								</div>
							),
						)}

						{busy || streamingText ? (
							<div className="flex gap-2.5">
								<LhMark className="mt-0.5 size-5 shrink-0 opacity-80" />
								<div className="min-w-0 flex-1">
									{thinkingText ? (
										<div className="mb-2 whitespace-pre-wrap break-words rounded-lg border border-border/60 bg-muted/40 px-2.5 py-2 text-xs leading-relaxed text-muted-foreground">
											{thinkingText}
										</div>
									) : null}
									{streamingText ? (
										<div className="font-prose text-(length:--lh-prose-size) leading-relaxed">
											<Markdown text={streamingText} />
										</div>
									) : (
										<p className="text-sm text-muted-foreground">{strings.thinking}</p>
									)}
								</div>
							</div>
						) : null}

						{error ? (
							<div className="rounded-xl border border-destructive/40 bg-destructive/5 px-3.5 py-3">
								<p className="text-sm font-medium text-destructive">{strings.chatError}</p>
								<p className="mt-1 whitespace-pre-wrap break-words text-xs leading-relaxed text-muted-foreground">{error}</p>
								{retryRef.current ? (
									<button
										type="button"
										onClick={retry}
										className="mt-2 rounded-lg border border-border px-3 py-1.5 text-xs active:bg-accent"
									>
										{strings.retry}
									</button>
								) : null}
							</div>
						) : null}
					</div>
				)}
			</div>

			<div className="lh-safe-bottom shrink-0 border-t border-border/60 bg-background px-3 pb-2 pt-2">
				{!targetModel ? (
					<button
						type="button"
						onClick={() => navigate("/settings")}
						className="mb-2 flex w-full items-center justify-between gap-2 rounded-xl border border-dashed border-border px-3 py-2 text-left active:bg-accent"
					>
						<span className="text-xs text-muted-foreground">{strings.modelRequired}</span>
						<span className="text-xs text-foreground">{strings.chooseModel}</span>
					</button>
				) : null}
				<MobileComposer
					value={text}
					onChange={setText}
					onSend={send}
					onStop={stop}
					busy={busy}
					placeholder={t("composer.placeholder")}
				/>
			</div>
		</div>
	);
}
