import { getChat, isTurnRunning, turnFailure, turnFailureAt, turnSettledAt, turnStartedAt } from "@/src/server";
import { activeProblemOf, failedResponseAtEnd, findPendingToolCall, pendingQuestionOf, projectView, type LhMessage } from "@/src/core";

/**
 * Background notice projection (mobile, owner request 2026-11-20): while the
 * app is in the background the Android shell polls this tiny state and turns
 * it into a notification. Computing it HERE keeps the notice independent of
 * a paused WebView — instrumentation showed the page's JS and even its
 * injected bridge can die while backgrounded, so the shell, not the page,
 * must observe the record.
 *
 * "busy" means keep polling. The three learner-facing states end the watch:
 * question (the turn is waiting for input), done, error.
 *
 * `since` is when the reported state BEGAN (epoch ms, same clock as the
 * shell): the shell only notifies for states newer than the moment the
 * learner left the app, so a question that was already on screen is never
 * re-announced.
 */
const PREVIEW = 120;

function answerPreview(view: ReturnType<typeof projectView>): string {
	for (let i = view.length - 1; i >= 0; i -= 1) {
		const message = view[i];
		if (!message || message.role !== "assistant") continue;
		const text = message.parts
			.filter((part) => part.type === "text" && typeof part.text === "string")
			.map((part) => part.text as string)
			.join(" ")
			.replace(/\s+/g, " ")
			.trim();
		if (text) return text.slice(0, PREVIEW);
	}
	return "";
}

/** The settle moment when known: the record's assistant message is written
 *  ahead at turn start, so its timestamp cannot answer "when did this land". */
function settledAt(id: string, messages: readonly LhMessage[]): number {
	return turnSettledAt(id) ?? messages[messages.length - 1]?.timestamp ?? 0;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
	const { id } = await params;
	const chat = getChat(id);
	if (!chat) return Response.json({ state: "idle", since: 0 });
	if (isTurnRunning(id)) {
		return Response.json({ state: "busy", since: turnStartedAt(id) ?? Date.now() });
	}
	const failure = turnFailure(id);
	if (failure) {
		return Response.json({
			state: "error",
			since: turnFailureAt(id) ?? Date.now(),
			title: "回答生成失败",
			body: failure.slice(0, PREVIEW),
		});
	}
	// A transport/provider failure settles as a durable failed assistant
	// message (stopReason "error"), not as a retained turnFailure.
	const failed = failedResponseAtEnd(chat.messages);
	if (failed) {
		return Response.json({
			state: "error",
			since: settledAt(id, chat.messages),
			title: "回答生成失败",
			body: (failed.errorMessage ?? "").trim().slice(0, PREVIEW) || "打开应用重试这一轮",
		});
	}
	const view = projectView(chat.messages);
	const question = findPendingToolCall(view, pendingQuestionOf(chat.messages));
	const problem = activeProblemOf(chat.messages);
	if (question || problem) {
		const input = (question?.input ?? problem?.input) as { question?: unknown; statement?: unknown } | null;
		const ask = typeof input?.question === "string" ? input.question
			: typeof input?.statement === "string" ? input.statement : "";
		return Response.json({
			state: "question",
			since: settledAt(id, chat.messages),
			title: "AI 在等你回答",
			body: ask.trim().slice(0, PREVIEW) || "打开应用继续这一轮学习",
		});
	}
	return Response.json({
		state: "done",
		since: settledAt(id, chat.messages),
		title: "回答已完成",
		body: answerPreview(view) || "打开应用查看完整回答",
	});
}
