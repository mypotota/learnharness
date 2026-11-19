/**
 * Transcript helpers shared by the agent loop and the chat view.
 *
 * The stored messages are pi-native, so nothing here knows about the old
 * flat `{role,text}` shape — the store migrates that on read.
 */

import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { ToolCall } from "@earendil-works/pi-ai";

/** Every tool that pauses the turn and waits for the learner. Prober and
 *  teacher use different names for the same mechanics. */
export const QUESTION_TOOL_NAMES = new Set(["quiz", "explain", "probe", "recall", "ask_user_question"]);

export function isQuestionTool(name: string): boolean {
	return QUESTION_TOOL_NAMES.has(name);
}

export function textOfMessage(message: AgentMessage): string {
	if (message.role === "custom") return message.content;
	if (message.role === "system") return "";
	const parts: string[] = [];
	for (const block of message.content) {
		if (typeof block === "string") {
			parts.push(block);
			continue;
		}
		if (block.type === "text") parts.push(block.text);
	}
	return parts.join("");
}

export function toolCallsOf(message: AgentMessage): ToolCall[] {
	if (message.role !== "assistant") return [];
	return message.content.filter((block): block is ToolCall => block.type === "toolCall");
}

/** Tool call ids that already have a persisted result. */
export function completedCallIds(messages: readonly AgentMessage[]): Set<string> {
	const ids = new Set<string>();
	for (const message of messages) {
		if (message.role === "toolResult") ids.add(message.toolCallId);
	}
	return ids;
}

export interface PendingQuestion {
	toolCallId: string;
	toolName: string;
	input: unknown;
}

/** The one question the learner still owes an answer to, if any. A turn
 *  always ends on the assistant message that posed it. */
export function pendingQuestion(messages: readonly AgentMessage[]): PendingQuestion | null {
	const last = messages[messages.length - 1];
	if (!last || last.role !== "assistant") return null;
	const answered = completedCallIds(messages);
	for (const call of toolCallsOf(last)) {
		if (isQuestionTool(call.name) && !answered.has(call.id)) {
			return { toolCallId: call.id, toolName: call.name, input: call.arguments };
		}
	}
	return null;
}

/** Every assistant tool call must be followed by exactly one result before
 *  the next API turn, or providers reject the history. Aborted turns (and a
 *  crash mid-question) leave dangling calls — close them with an honest
 *  placeholder. A real answer result is appended before this runs. */
export function healDanglingToolCalls(messages: readonly AgentMessage[]): AgentMessage[] {
	const answered = completedCallIds(messages);
	const healed: AgentMessage[] = [];
	for (const message of messages) {
		healed.push(message);
		if (message.role !== "assistant") continue;
		for (const call of toolCallsOf(message)) {
			if (answered.has(call.id)) continue;
			healed.push({
				role: "toolResult",
				toolCallId: call.id,
				toolName: call.name,
				content: [{ type: "text", text: "No answer was recorded — the turn was interrupted." }],
				details: null,
				isError: true,
				timestamp: Date.now(),
			});
			answered.add(call.id);
		}
	}
	return healed;
}

/** The last line of the transcript, used by the chat view to decide whether
 *  the composer or a question card owns the bottom of the screen. */
export function lastMessage(messages: readonly AgentMessage[]): AgentMessage | undefined {
	return messages[messages.length - 1];
}
