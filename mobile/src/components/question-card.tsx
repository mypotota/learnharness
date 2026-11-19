/**
 * The mobile question card — one question, fully interactive.
 *
 * Same data contract as the desktop dock: the question data is rebuilt from
 * the tool call (shuffled deterministically by callId), the answer is built
 * with `buildAnswer` and graded locally, and the full record is kept so the
 * answered card can replay exactly what the learner did.
 */

import { useMemo, useState } from "react";
import { CheckIcon, XIcon } from "lucide-react";
import { Markdown } from "./markdown";
import { useI18n, useT } from "../platform/i18n-provider";
import { MOBILE_STRINGS } from "../strings";
import { cn } from "@/lib/utils";
import {
	buildAnswer,
	CONFIDENCE_STOPS,
	DEFAULT_CONFIDENCE_INDEX,
	normalizeOptions,
	normalizeQuizType,
	resolveCorrect,
	seededRandom,
	shuffleOptions,
	toggleOption,
	toggleOther,
	emptyDockSelection,
	type AnswerRequest,
	type DockSelection,
	type QuestionAnswerData,
	type QuestionData,
	type QuestionKind,
	type SelectMode,
} from "@/src/core/question-core.ts";
import { answerForPresentation } from "@/src/core/answer-presentation.ts";
import { parseAskInput, parseQuizInput } from "@/src/core/tool-parts.ts";

function questionKindOf(tool: string): QuestionKind {
	return tool === "quiz" || tool === "probe" ? "quiz" : tool === "explain" || tool === "recall" ? "explain" : "ask";
}

function buildQuestionData(toolCallId: string, tool: string, input: Record<string, unknown>): QuestionData {
	const kind = questionKindOf(tool);
	const quizInput = kind === "quiz" ? input : null;
	const askInput = kind === "ask" ? input : null;
	const explainInput = kind === "explain" ? input : null;
	const multi = input.multiSelect === true;
	const rawOptions = (quizInput?.options ?? askInput?.options ?? []) as { label: string; value?: string }[];
	const mode: QuestionData["mode"] =
		kind === "quiz" ? (multi ? "multi-select" : "single-select") : rawOptions.length > 0 ? (multi ? "multi-select" : "single-select") : "text";
	const options = normalizeOptions(rawOptions);
	const ordered = kind === "quiz" && options.length > 0 ? shuffleOptions(options, seededRandom(toolCallId)) : options;
	const qd: QuestionData = {
		id: toolCallId,
		kind,
		questionType: kind === "quiz" ? normalizeQuizType(input.type) : undefined,
		question: typeof input.question === "string" ? input.question : "",
		context: typeof input.details === "string" ? input.details : undefined,
		mode,
		options: ordered,
		createdAt: new Date().toISOString(),
	};
	if (quizInput) {
		const resolved = resolveCorrect(quizInput.correctAnswer as string | string[] | undefined, ordered);
		qd.correctIndices = resolved.indices;
		qd.explanation = typeof quizInput.explanation === "string" ? quizInput.explanation : undefined;
	}
	if (explainInput) qd.committedAnswer = typeof explainInput.correctAnswer === "string" ? explainInput.correctAnswer : undefined;
	return qd;
}

function kindLabel(t: ReturnType<typeof useT>, tool: string, qd: QuestionData): string {
	if (tool === "probe") return t("question.kindProbe");
	if (tool === "recall") return t("question.kindRecall");
	if (qd.kind === "quiz") return qd.questionType === "predict" ? t("question.kindPredict") : t("question.kindCheck");
	if (qd.kind === "explain") return t("question.kindExplain");
	return t("question.kindQuestion");
}

/** The check reveal: a teach-phase `check` stays folded until invited. */
function startsCollapsed(tool: string, qd: QuestionData): boolean {
	return qd.kind === "quiz" && qd.questionType === "check" && (tool === "quiz") === true;
}

export function QuestionCard({
	toolCallId,
	tool,
	input,
	onSubmit,
	onDismiss,
}: {
	toolCallId: string;
	tool: string;
	input: Record<string, unknown>;
	onSubmit: (answer: QuestionAnswerData) => void;
	onDismiss: () => void;
}) {
	const t = useT();
	const { locale } = useI18n();
	const strings = MOBILE_STRINGS[locale];
	const qd = useMemo(() => buildQuestionData(toolCallId, tool, input), [toolCallId, tool, input]);
	const [revealed, setRevealed] = useState(() => !startsCollapsed(tool, qd));
	const [sel, setSel] = useState<DockSelection>(() => emptyDockSelection());
	const [thinking, setThinking] = useState("");
	const [other, setOther] = useState("");
	const [text, setText] = useState("");
	const [confIdx, setConfIdx] = useState(DEFAULT_CONFIDENCE_INDEX);

	const selectMode: SelectMode = qd.mode === "multi-select" ? "multi-select" : "single-select";
	const canSubmit =
		qd.mode === "text" ? text.trim().length > 0 : sel.dontKnow || (sel.otherSelected && other.trim().length > 0) || sel.selected.size > 0;

	const submit = () => {
		if (!canSubmit) return;
		const req: AnswerRequest = {
			dontKnow: sel.dontKnow,
			values: [...sel.selected].map((index) => qd.options[index]!.value),
			other: sel.otherSelected ? other : undefined,
			text: qd.mode === "text" ? text : undefined,
			thinking: qd.mode !== "text" ? thinking.trim() || undefined : undefined,
			confidence: qd.kind === "quiz" ? CONFIDENCE_STOPS[confIdx] : undefined,
		};
		onSubmit(buildAnswer(qd, req, tool));
	};

	if (!revealed) {
		return (
			<div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-3.5 py-3">
				<span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{kindLabel(t, tool, qd)}</span>
				<button
					type="button"
					onClick={() => setRevealed(true)}
					className="rounded-lg border border-border px-3 py-1.5 text-sm active:bg-accent"
				>
					{t("question.checkUnderstanding")}
				</button>
			</div>
		);
	}

	const showOptions = qd.mode !== "text";

	return (
		<div className="rounded-xl border border-border bg-card p-3.5" data-testid="question-card">
			<div className="mb-1 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
				<span>{kindLabel(t, tool, qd)}</span>
				{qd.mode === "multi-select" ? <span className="normal-case">· {strings.questionSelectAll}</span> : null}
			</div>
			<div className="font-prose text-(length:--lh-prose-size) leading-relaxed">
				<Markdown text={qd.question} />
			</div>
			{qd.context ? (
				<div className="mt-2 text-sm text-muted-foreground">
					<Markdown text={qd.context} />
				</div>
			) : null}

			{showOptions ? (
				<div className="mt-3 flex flex-col gap-2">
					{qd.options.map((option, index) => {
						const selected = sel.selected.has(index);
						return (
							<button
								key={option.value}
								type="button"
								aria-pressed={selected}
								onClick={() => setSel((prev) => toggleOption(selectMode, prev, index))}
								className={cn(
									"flex items-start gap-3 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors active:bg-accent",
									selected ? "border-primary bg-accent" : "border-border",
								)}
							>
								<span
									className={cn(
										"mt-0.5 flex size-4 shrink-0 items-center justify-center border",
										qd.mode === "multi-select" ? "rounded-sm" : "rounded-full",
										selected ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40",
									)}
								>
									{selected ? <span className={cn(qd.mode === "multi-select" ? "" : "size-1.5 rounded-full bg-current")}>{qd.mode === "multi-select" ? "✓" : ""}</span> : null}
								</span>
								<span className="min-w-0 flex-1">
									<Markdown text={option.label} />
								</span>
							</button>
						);
					})}

					{qd.kind === "quiz" ? (
						<button
							type="button"
							aria-pressed={sel.dontKnow}
							onClick={() => setSel((prev) => ({ ...prev, selected: new Set(), otherSelected: false, dontKnow: !prev.dontKnow }))}
							className={cn(
								"flex items-start gap-3 rounded-lg border border-dashed px-3 py-2.5 text-left text-sm transition-colors",
								sel.dontKnow ? "border-primary text-foreground" : "text-muted-foreground",
							)}
						>
							<span
								className={cn(
									"mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border",
									sel.dontKnow ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40",
								)}
							>
								{sel.dontKnow ? <span className="size-1.5 rounded-full bg-current" /> : null}
							</span>
							<span>{t("question.dontKnow")}</span>
						</button>
					) : null}

					{qd.kind === "ask" ? (
						<div
							className={cn(
								"flex items-start gap-3 rounded-lg border px-3 py-2.5 text-sm transition-colors",
								sel.otherSelected ? "border-primary bg-accent" : "border-dashed border-border",
							)}
						>
							<button
								type="button"
								aria-pressed={sel.otherSelected}
								onClick={() => setSel((prev) => toggleOther(selectMode, prev))}
								className={cn(
									"mt-0.5 flex size-4 shrink-0 items-center justify-center border",
									qd.mode === "multi-select" ? "rounded-sm" : "rounded-full",
									sel.otherSelected ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40",
								)}
							>
								{sel.otherSelected ? <span className={cn(qd.mode === "multi-select" ? "" : "size-1.5 rounded-full bg-current")}>{qd.mode === "multi-select" ? "✓" : ""}</span> : null}
							</button>
							<input
								value={other}
								onFocus={() => setSel((prev) => (prev.otherSelected ? prev : toggleOther(selectMode, prev)))}
								onChange={(event) => {
									setOther(event.target.value);
									setSel((prev) => (prev.otherSelected ? prev : toggleOther(selectMode, prev)));
								}}
								placeholder={t("question.typeOwnAnswer")}
								className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted-foreground"
							/>
						</div>
					) : null}
				</div>
			) : null}

			{qd.kind === "quiz" ? (
				<div className="mt-3 border-t border-border/60 pt-2.5">
					<div className="flex items-center gap-3">
						<span className="shrink-0 text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("question.confidence")}</span>
						<input
							type="range"
							min={0}
							max={100}
							step={1}
							value={CONFIDENCE_STOPS[confIdx]}
							disabled={sel.dontKnow}
							aria-label={t("question.confidenceAria")}
							onChange={(event) => {
								const value = Number(event.target.value);
								let best = 0;
								for (let index = 1; index < CONFIDENCE_STOPS.length; index++) {
									if (Math.abs(CONFIDENCE_STOPS[index]! - value) < Math.abs(CONFIDENCE_STOPS[best]! - value)) best = index;
								}
								setConfIdx(best);
							}}
							className={cn("min-w-0 flex-1 accent-foreground", sel.dontKnow && "opacity-40")}
						/>
						<span className={cn("w-9 shrink-0 text-right font-mono text-sm tabular-nums", sel.dontKnow && "text-muted-foreground/50")}>
							{sel.dontKnow ? "—" : `${CONFIDENCE_STOPS[confIdx]}%`}
						</span>
					</div>
				</div>
			) : null}

			<div className="mt-3 rounded-[10px] border border-border/70 bg-background/60">
				<div className="px-2.5 pt-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
					{qd.mode === "text" ? t("question.answer") : strings.questionThinking}
				</div>
				{qd.mode === "text" ? (
					<textarea
						value={text}
						onChange={(event) => setText(event.target.value)}
						placeholder={t("question.typeAnswer")}
						rows={4}
						className="max-h-48 w-full resize-none bg-transparent px-2.5 py-2 text-sm outline-none placeholder:text-muted-foreground"
					/>
				) : (
					<textarea
						value={thinking}
						onChange={(event) => setThinking(event.target.value)}
						placeholder={t("question.thinkingPlaceholder")}
						rows={3}
						className="max-h-48 w-full resize-none bg-transparent px-2.5 py-2 text-sm outline-none placeholder:text-muted-foreground/70"
					/>
				)}
				<div className="flex items-center justify-between gap-2 p-1">
					<button type="button" onClick={onDismiss} className="rounded-lg px-2 py-1.5 text-xs text-muted-foreground active:bg-accent">
						{strings.questionSkip}
					</button>
					<button
						type="button"
						disabled={!canSubmit}
						onClick={submit}
						className={cn(
							"rounded-lg px-3.5 py-2 text-sm font-medium",
							canSubmit ? "bg-primary text-primary-foreground active:opacity-90" : "bg-muted text-muted-foreground",
						)}
					>
						{t("question.submitAnswer")}
					</button>
				</div>
			</div>
		</div>
	);
}

export function AnsweredQuestion({
	tool,
	input,
	answer: stored,
}: {
	tool: string;
	input: Record<string, unknown>;
	answer: QuestionAnswerData;
}) {
	const t = useT();
	const answer = answerForPresentation(stored, input);
	const [whyOpen, setWhyOpen] = useState(false);
	const qd = useMemo(() => buildQuestionData(String(answer.questionText), tool, input), [tool, input, answer.questionText]);

	if (answer.dismissed) {
		return (
			<div className="rounded-xl border border-border bg-card px-3.5 py-3 text-sm text-muted-foreground">
				<span className="font-medium text-foreground">{answer.questionText}</span> {t("question.skipped")}
			</div>
		);
	}

	const isQuiz = answer.kind === "quiz";
	const isExplain = answer.kind === "explain";
	const selected = new Set(answer.answers.map((entry) => entry.index));
	const correct = new Set(answer.correctIndices ?? []);
	const details = answer.kind === "ask" ? parseAskInput(input)?.details : parseQuizInput(input)?.details;

	return (
		<div className="rounded-xl border border-border bg-card p-3.5" data-testid="answered-card">
			<div className="mb-1 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
				<span>{kindLabel(t, tool, qd)}</span>
				{isQuiz ? (
					answer.dontKnow ? (
						<span className="rounded-full bg-muted px-2 py-0.5 normal-case">{t("question.verdictDontKnow")}</span>
					) : answer.correct ? (
						<span className="rounded-full bg-success/15 px-2 py-0.5 normal-case text-success">{t("question.verdictCorrect")}</span>
					) : (
						<span className="rounded-full bg-destructive/10 px-2 py-0.5 normal-case text-destructive">{t("question.verdictIncorrect")}</span>
					)
				) : null}
			</div>
			<div className="font-prose text-(length:--lh-prose-size) leading-relaxed">
				<Markdown text={answer.questionText} />
			</div>
			{details ? (
				<div className="mt-2 text-sm text-muted-foreground">
					<Markdown text={details} />
				</div>
			) : null}

			{(answer.options?.length ?? 0) > 0 || answer.other ? (
				<div className="mt-3 flex flex-col gap-1.5 text-sm">
					{answer.options?.map((option) => {
						const chosen = selected.has(option.index);
						const right = isQuiz && correct.has(option.index);
						return (
							<div
								key={option.index}
								className={cn(
									"flex items-center gap-2 rounded-lg border px-3 py-2",
									chosen && right && "border-success/60 bg-success/10",
									chosen && !right && isQuiz && "border-destructive/60 bg-destructive/10",
									chosen && !isQuiz && "border-primary bg-accent",
									!chosen && right && "border-success/40",
								)}
							>
								{isQuiz && (chosen || right) ? (
									right ? (
										<CheckIcon className="size-3.5 shrink-0 text-success" />
									) : (
										<XIcon className="size-3.5 shrink-0 text-destructive" />
									)
								) : null}
								<span className={cn("min-w-0 flex-1", !chosen && "text-muted-foreground")}>
									<Markdown text={option.label} />
								</span>
							</div>
						);
					})}
					{answer.other ? (
						<div className="flex items-center gap-2 rounded-lg border border-primary bg-accent px-3 py-2">
							<span>“{answer.other}”</span>
						</div>
					) : null}
				</div>
			) : null}

			{answer.text ? <div className="mt-2 whitespace-pre-wrap text-sm">“{answer.text}”</div> : null}

			{isQuiz && answer.confidence != null ? (
				<div className="mt-3 flex items-center gap-3">
					<div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
						<div className="h-full rounded-full bg-foreground/40" style={{ width: `${answer.confidence}%` }} />
					</div>
					<span className="w-9 shrink-0 text-right font-mono text-sm tabular-nums text-muted-foreground">{answer.confidence}%</span>
				</div>
			) : null}
			{answer.dontKnow && isQuiz ? <div className="mt-2 text-sm text-muted-foreground">{t("question.answeredDontKnow")}</div> : null}

			{answer.thinking || answer.note ? (
				<div className="mt-3 rounded-lg border border-border/60 bg-muted/40 px-2.5 py-2 text-xs leading-relaxed text-muted-foreground">
					<div className="mb-1 font-medium uppercase tracking-wide">{t("practice.yourThinking")}</div>
					<div className="whitespace-pre-wrap">{answer.thinking ?? answer.note}</div>
				</div>
			) : null}

			{isQuiz && answer.explanation ? (
				<div className="mt-2">
					<button type="button" onClick={() => setWhyOpen((open) => !open)} className="text-xs font-medium text-muted-foreground active:text-foreground">
						{whyOpen ? t("question.hideWhy") : t("question.why")}
					</button>
					{whyOpen ? (
						<div className="mt-1.5 rounded-lg bg-muted px-2.5 py-2 text-sm text-muted-foreground">
							<span className="font-medium text-foreground">{t("question.whyLabel")}</span>
							<Markdown text={answer.explanation} />
						</div>
					) : null}
				</div>
			) : null}

			{isExplain && answer.committed ? (
				<div className="mt-3 rounded-lg bg-muted px-2.5 py-2 text-sm text-muted-foreground">
					<span className="font-medium text-foreground">{t("question.answerLabel")}</span>
					<Markdown text={answer.committed} />
				</div>
			) : null}
		</div>
	);
}
