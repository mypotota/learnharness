/**
 * The mobile teaching prompt.
 *
 * It is the desktop's philosophical core — the base identity, the method,
 * the teaching contract, and the shared voice/accuracy/formatting law —
 * composed from the SAME markdown files the desktop agent reads. The
 * fragments that only make sense with the desktop tool belt (planning jobs,
 * quiz cards, research, demos, learner files) are omitted, and a short
 * mapping note explains how their mechanics become plain prose on mobile.
 */

import base from "@/src/agent/system-prompt.md?raw";
import method from "@/src/agent/prompts/teacher/05-method.md?raw";
import teaching from "@/src/agent/prompts/teacher/20-teaching.md?raw";
import predictions from "@/src/agent/prompts/teacher/28-predictions.md?raw";
import voice from "@/src/agent/prompts/shared/10-voice.md?raw";
import accuracy from "@/src/agent/prompts/shared/15-accuracy.md?raw";
import mentalModel from "@/src/agent/prompts/shared/16-mental-model.md?raw";
import sideConversations from "@/src/agent/prompts/shared/35-side-conversations.md?raw";
import formatting from "@/src/agent/prompts/shared/40-formatting.md?raw";

const MOBILE_DELIVERY = `# Delivery on mobile

This build has no tools. Never emit a tool call, a JSON envelope, or a request to run code — the learner cannot receive any of it.

Map the tool names you may see in the material below onto plain replies:

- \`send_to_user\` — write that content directly as your reply.
- \`quiz\` — write the check as a question in your reply, then stop and wait for the answer.
- \`ask_user_question\` — ask it in prose, then stop and wait.
- \`research\` — answer from what you know; say plainly when something would need verification you cannot perform here.
- job/plan/file tools — keep the plan in your head; do not mention the machinery to the learner.

Everything else — the teaching method, the honesty rules, the voice, the markdown and LaTeX contract — applies exactly as written.`;

const PRACTICE_NOTE = `# Practice on mobile

This is a practice session. Pose exactly one exercise at a time, with its full statement and (when useful) the answer format. Stop after asking. When the learner answers, grade it honestly, explain the mistake precisely, and only then move to the next exercise. Keep a running sense of which skills are solid and which need another rep.`;

export type MobileSessionKind = "teach" | "practice";

const cache = new Map<MobileSessionKind, string>();

export function mobileSystemPrompt(kind: MobileSessionKind): string {
	const cached = cache.get(kind);
	if (cached) return cached;
	const composed = [base, MOBILE_DELIVERY];
	if (kind === "practice") composed.push(PRACTICE_NOTE);
	composed.push(method, teaching, predictions, voice, accuracy, mentalModel, sideConversations, formatting);
	const prompt = composed.join("\n\n---\n\n");
	cache.set(kind, prompt);
	return prompt;
}
