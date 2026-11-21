import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { LhMark } from "@/components/lh-mark";
import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { ToolCall } from "@earendil-works/pi-ai";
import { MobileComposer } from "../components/composer";
import { Markdown } from "../components/markdown";
import { QuestionCard, AnsweredQuestion } from "../components/question-card";
import { PlanCard, ProbeAssessmentCard } from "../components/plan-card";
import { useI18n, useT } from "../platform/i18n-provider";
import { navigate } from "../platform/next-navigation";
import { appendMessage, sessionPhase, useSession, userMessage, type MobileSession } from "../store";
import { MOBILE_STRINGS } from "../strings";
import { bootEngine } from "../engine/boot";
import { abortActiveTurn, runTurn, submitQuestionAnswer } from "../engine/agent";
import { findModel, modelsVersion, selectedModel, subscribeModels } from "../engine/registry";
import { isQuestionTool, pendingQuestion, textOfMessage, toolCallsOf } from "../engine/transcript";
import { dismissedAnswer, type QuestionAnswerData, type QuestionKind } from "@/src/core/question-core.ts";
import { parseQuestionInput } from "@/src/core/tool-parts.ts";
import { toolQuestionKind } from "@/src/core/pending.ts";

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

	useSyncExternalStore(subscribeModels, modelsVersion, modelsVersion);
	const target = selectedModel();
	const targetModel = target ? findModel(target) : undefined;

	const messages = useMemo(() => session?.messages ?? [], [session]);
	const messageCount = messages.length;
	const pending = useMemo(() => pendingQuestion(messages), [messages]);
	const phase = session ? sessionPhase(session) : "probe";

	useEffect(() => {
		const el = scrollRef.current;
		if (el) el.scrollTop = el.scrollHeight;
	}, [messageCount, streamingText, thinkingText, error, pending?.toolCallId]);

	useEffect(() => {
		return () => abortActiveTurn();
	}, []);

	const run = async () => {
		if (!session) return;
		const ref = selectedModel();
		if (!ref || !findModel(ref)) {
			setError(strings.modelRequired);
			return;
		}
		setBusy(true);
		setError(null);
		setThinkingText("");
		setStreamingText("");
		try {
			await bootEngine();
			await runTurn(session.id, {
				onText: setStreamingText,
				onThinking: setThinkingText,
				onCommitted: () => {
					setStreamingText("");
					setThinkingText("");
				},
			});
		} catch (failure) {
			setError(failure instanceof Error ? failure.message : strings.chatError);
		} finally {
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
		if (session.messages.length > 0 && !session.messages.some((message) => message.role === "assistant")) void run();
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
		if (!draft || busy || pending) return;
		appendMessage(session.id, userMessage(draft));
		setText("");
		void run();
	};

	const stop = () => abortActiveTurn();

	const answer = (toolCallId: string, toolName: string) => (value: QuestionAnswerData) => {
		void submitAnswer(toolCallId, toolName, value);
	};

	const dismiss = (toolCallId: string, toolName: string) => () => {
		const question = parseQuestionInput(toolName, findCall(session.messages, toolCallId)?.arguments);
		const kind: QuestionKind = toolQuestionKind(toolName);
		submitAnswer(toolCallId, toolName, {
			...dismissedAnswer(kind, question?.question ?? ""),
			tool: toolName,
		});
	};

	const submitAnswer = async (toolCallId: string, toolName: string, value: QuestionAnswerData) => {
		if (busy) return;
		setBusy(true);
		setError(null);
		setText("");
		try {
			await bootEngine();
			await submitQuestionAnswer(session.id, toolCallId, toolName, value, {
				onText: setStreamingText,
				onThinking: setThinkingText,
				onCommitted: () => {
					setStreamingText("");
					setThinkingText("");
				},
			});
		} catch (failure) {
			setError(failure instanceof Error ? failure.message : strings.chatError);
		} finally {
			setBusy(false);
			setStreamingText("");
			setThinkingText("");
		}
	};

	return (
		<div className="flex h-full flex-col">
			<div ref={scrollRef} className="lh-scroll min-h-0 flex-1 overflow-y-auto px-4 py-4">
				{messages.length === 0 && !busy ? (
					<p className="mt-10 text-center text-sm text-muted-foreground">{strings.emptyChat}</p>
				) : (
					<div className="flex flex-col gap-5">
						{messages.map((message, index) => (
							<TranscriptMessage
								key={`${message.role}-${index}`}
								message={message}
								messages={messages}
								answers={session.answers}
								pendingCallId={pending?.toolCallId ?? null}
								strings={strings}
								onSubmit={answer}
								onDismiss={dismiss}
							/>
						))}

						{busy || streamingText ? (
							<div className="min-w-0">
								{thinkingText ? (
									<div className="mb-2 whitespace-pre-wrap break-words rounded-lg border border-border/60 bg-muted/40 px-2.5 py-2 text-xs leading-relaxed text-muted-foreground">
										{thinkingText}
									</div>
								) : null}
								{streamingText ? (
									<div className="font-prose text-(length:--lh-prose-size) leading-relaxed">
										<Markdown text={streamingText} />
									</div>
								) : pending ? null : (
									<p className="text-sm text-muted-foreground">{strings.thinking}</p>
								)}
							</div>
						) : null}

						{error ? (
							<div className="rounded-xl border border-destructive/40 bg-destructive/5 px-3.5 py-3">
								<p className="text-sm font-medium text-destructive">{strings.chatError}</p>
								<p className="mt-1 whitespace-pre-wrap break-words text-xs leading-relaxed text-muted-foreground">{error}</p>
								<button
									type="button"
									onClick={() => void run()}
									className="mt-2 rounded-lg border border-border px-3 py-1.5 text-xs active:bg-accent"
								>
									{strings.retry}
								</button>
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
				{session.kind === "teach" && phase === "probe" ? (
					<p className="mb-1.5 px-1 text-[11px] text-muted-foreground">{strings.phaseProbing}</p>
				) : null}
				{pending ? (
					<p className="mb-1 py-2 text-center text-xs text-muted-foreground">{strings.answerFirst}</p>
				) : (
					<MobileComposer
						value={text}
						onChange={setText}
						onSend={send}
						onStop={stop}
						busy={busy}
						placeholder={t("composer.placeholder")}
					/>
				)}
			</div>
		</div>
	);
}

function findCall(messages: readonly AgentMessage[], toolCallId: string): ToolCall | undefined {
	for (const message of messages) {
		for (const call of toolCallsOf(message)) {
			if (call.id === toolCallId) return call;
		}
	}
	return undefined;
}

function resultMap(messages: readonly AgentMessage[]): Map<string, { details?: unknown; isError?: boolean }> {
	const map = new Map<string, { details?: unknown; isError?: boolean }>();
	for (const message of messages) {
		if (message.role === "toolResult") map.set(message.toolCallId, { details: message.details, isError: message.isError });
	}
	return map;
}

function TranscriptMessage({
	message,
	messages,
	answers,
	pendingCallId,
	strings,
	onSubmit,
	onDismiss,
}: {
	message: AgentMessage;
	messages: readonly AgentMessage[];
	answers: Record<string, QuestionAnswerData>;
	pendingCallId: string | null;
	strings: typeof MOBILE_STRINGS.en;
	onSubmit: (toolCallId: string, toolName: string) => (answer: QuestionAnswerData) => void;
	onDismiss: (toolCallId: string, toolName: string) => () => void;
}) {
	if (message.role === "custom") {
		return (
			<div className="flex items-center gap-3 px-1">
				<span className="h-px flex-1 bg-border/60" />
				<span className="text-[11px] uppercase tracking-wide text-muted-foreground">{strings.handoffNote}</span>
				<span className="h-px flex-1 bg-border/60" />
			</div>
		);
	}
	if (message.role === "user") {
		return (
			<div className="flex justify-end">
				<div className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-secondary px-3.5 py-2.5 text-sm leading-relaxed text-secondary-foreground">
					{textOfMessage(message)}
				</div>
			</div>
		);
	}
	if (message.role !== "assistant") return null;

	const results = resultMap(messages);
	const blocks = message.content;

	return (
		<div className="flex min-w-0 flex-col gap-2.5">
			{blocks.map((block, index) => {
				if (block.type === "text") {
					if (!block.text.trim()) return null;
					return (
						<div key={`text-${index}`} className="font-prose text-(length:--lh-prose-size) leading-relaxed">
							<Markdown text={block.text} />
						</div>
					);
				}
				if (block.type !== "toolCall") return null;
				const call = block;
				const input = (call.arguments ?? {}) as Record<string, unknown>;
				const answered = answers[call.id];
				const result = results.get(call.id);

				if (isQuestionTool(call.name)) {
					if (answered) return <AnsweredQuestion key={call.id} tool={call.name} input={input} answer={answered} />;
					if (call.id === pendingCallId) {
						return (
							<QuestionCard
								key={call.id}
								toolCallId={call.id}
								tool={call.name}
								input={input}
								onSubmit={onSubmit(call.id, call.name)}
								onDismiss={onDismiss(call.id, call.name)}
							/>
						);
					}
					return null;
				}

				if (call.name === "plan_init") {
					const tree = (result?.details as { tree?: Parameters<typeof PlanCard>[0]["tree"] } | undefined)?.tree;
					if (tree) return <PlanCard key={call.id} tree={tree} messages={messages} callId={call.id} />;
					return null;
				}

				if (call.name === "probe_done") return <ProbeAssessmentCard key={call.id} input={input} />;

				if (call.name === "send_to_user" && typeof input.message === "string") {
					return (
						<div key={call.id} className="font-prose text-(length:--lh-prose-size) leading-relaxed">
							<Markdown text={input.message} />
						</div>
					);
				}

				return null;
			})}
		</div>
	);
}
