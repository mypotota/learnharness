/**
 * The mobile turn loop.
 *
 * One Agent run per turn, reconstructed from the persisted transcript so a
 * reload (or a cold app start) is just another turn: messages in, stream
 * out, results appended. Questions end the run; the learner's answer is
 * appended as the call's result and the run continues — exactly the
 * desktop's stateless re-entry, minus the server.
 */

import { Agent } from "@earendil-works/pi-agent-core";
import type { AgentMessage } from "@earendil-works/pi-agent-core";
import { HANDOFF_TEXT } from "@/src/core/contracts/chat.ts";
import { compactAnswerForModel, type QuestionAnswerData } from "@/src/core/question-core.ts";
import { toLlmMessages } from "@/src/core/native-messages.ts";
import {
	appendMessage,
	getSession,
	saveAnswer,
	sessionPhase,
} from "../store";
import { findModel, defaultThinkingLevel, modelsEngine, selectedModel } from "./registry";
import { getQuestionMechanic, type QuestionMechanic } from "./preferences";
import { mobileAgentPrompt, mobileSystemPrompt } from "./prompt";
import { createMobileTools } from "./tools";
import { healDanglingToolCalls, isQuestionTool } from "./transcript";

export interface TurnCallbacks {
	onText(text: string): void;
	onThinking(text: string): void;
	/** Fired when an assistant or tool-result message has been committed to
	 *  the store — the view can drop its streaming buffer. */
	onCommitted?(): void;
}

let activeAgent: Agent | null = null;

export function abortActiveTurn(): void {
	activeAgent?.abort();
}

function renderable(message: AgentMessage): boolean {
	if (message.role !== "assistant") return true;
	if (message.stopReason === "error") return false;
	return message.content.some((block) => block.type === "toolCall" || (block.type === "text" && block.text.length > 0));
}

export async function runTurn(sessionId: string, callbacks: TurnCallbacks): Promise<void> {
	const session = getSession(sessionId);
	if (!session) return;
	const ref = selectedModel();
	const model = ref ? findModel(ref) : undefined;
	if (!ref || !model) throw new Error("No model selected");

	const mechanic: QuestionMechanic = getQuestionMechanic();
	const practice = session.kind === "practice";
	const phase = sessionPhase(session);
	let probeConcluded = false;

	const tools = practice
		? []
		: createMobileTools({
				sessionId,
				phase,
				mechanic,
				model,
				onProbeConcluded: () => {
					probeConcluded = true;
				},
			});

	const agent = new Agent({
		initialState: {
			systemPrompt: practice ? mobileSystemPrompt("practice") : mobileAgentPrompt(phase, mechanic),
			model,
			thinkingLevel: ref.thinkingLevel ?? defaultThinkingLevel(model),
			tools,
			messages: healDanglingToolCalls(session.messages),
		},
		streamFn: (targetModel, context, options) => modelsEngine().streamSimple(targetModel, context, options),
		convertToLlm: toLlmMessages,
		toolExecution: "sequential",
		finishTurn: (turn) =>
			turn.toolResults.some((result) => !result.isError && isQuestionTool(result.toolName))
				? { action: "end" }
				: undefined,
	});

	activeAgent = agent;
	let streamText = "";
	let streamThinking = "";
	const unsubscribe = agent.subscribe((event) => {
		if (event.type === "message_start") {
			if (event.message.role === "assistant") {
				streamText = "";
				streamThinking = "";
				callbacks.onText("");
				callbacks.onThinking("");
			}
			return;
		}
		if (event.type === "message_update") {
			const delta = event.assistantMessageEvent;
			if (delta.type === "text_delta") {
				streamText += delta.delta;
				callbacks.onText(streamText);
			} else if (delta.type === "thinking_delta") {
				streamThinking += delta.delta;
				callbacks.onThinking(streamThinking);
			}
			return;
		}
		if (event.type !== "message_end") return;
		const message = event.message;
		if (message.role === "assistant") {
			if (renderable(message)) appendMessage(sessionId, message);
			callbacks.onText("");
			callbacks.onThinking("");
			callbacks.onCommitted?.();
			return;
		}
		if (message.role === "toolResult") {
			// Question results are placeholders; the real answer is appended
			// when the learner submits, the same split the desktop record uses.
			if (!isQuestionTool(message.toolName)) appendMessage(sessionId, message);
			callbacks.onCommitted?.();
		}
	});

	try {
		await agent.continue();
		const failure = agent.state.errorMessage;
		if (failure) throw new Error(failure);
	} finally {
		unsubscribe();
		activeAgent = null;
	}

	if (probeConcluded) {
		const latest = getSession(sessionId);
		if (latest && !latest.messages.some((message) => message.role === "custom")) {
			appendMessage(sessionId, {
				role: "custom",
				customType: "probe-handoff",
				content: HANDOFF_TEXT,
				display: true,
				timestamp: Date.now(),
			} as AgentMessage);
			await runTurn(sessionId, callbacks);
		}
	}
}

/** Persist the learner's answer and continue the same turn. */
export async function submitQuestionAnswer(
	sessionId: string,
	toolCallId: string,
	toolName: string,
	answer: QuestionAnswerData,
	callbacks: TurnCallbacks,
): Promise<void> {
	saveAnswer(sessionId, toolCallId, answer);
	appendMessage(sessionId, {
		role: "toolResult",
		toolCallId,
		toolName,
		content: [{ type: "text", text: JSON.stringify(compactAnswerForModel(answer)) }],
		details: answer,
		isError: false,
		timestamp: Date.now(),
	} as unknown as AgentMessage);
	await runTurn(sessionId, callbacks);
}
