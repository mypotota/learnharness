/**
 * The mobile teaching prompt.
 *
 * Same philosophical core and same markdown fragments the desktop agent
 * composes — base identity, the teaching method, the probe doctrine, the
 * plan/question craft and the shared voice/accuracy/formatting law. Only
 * the fragments that require tools this build does not ship (jobs, demos,
 * images) are omitted, and a short note states what IS available.
 */

import base from "@/src/agent/system-prompt.md?raw";
import method from "@/src/agent/prompts/teacher/05-method.md?raw";
import planning from "@/src/agent/prompts/teacher/10-planning.md?raw";
import teaching from "@/src/agent/prompts/teacher/20-teaching.md?raw";
import predictions from "@/src/agent/prompts/teacher/28-predictions.md?raw";
import questionPrinciples from "@/src/agent/prompts/teacher/30-question-principles.md?raw";
import probeDoctrine from "@/src/agent/prompts/prober/10-probe-doctrine.md?raw";
import voice from "@/src/agent/prompts/shared/10-voice.md?raw";
import accuracy from "@/src/agent/prompts/shared/15-accuracy.md?raw";
import mentalModel from "@/src/agent/prompts/shared/16-mental-model.md?raw";
import questionTools from "@/src/agent/prompts/shared/20-question-tools.md?raw";
import confidence from "@/src/agent/prompts/shared/25-confidence.md?raw";
import sideConversations from "@/src/agent/prompts/shared/35-side-conversations.md?raw";
import formatting from "@/src/agent/prompts/shared/40-formatting.md?raw";

import type { QuestionMechanic } from "./preferences";

const MOBILE_BUILD = `# This build

You are the same teacher, running on a phone. The tool belt is smaller than the desktop's, and the interface is a transcript:

- Available: the phase's question tool (\`probe\`/\`recall\` while probing, \`quiz\`/\`explain\` while teaching), \`ask_user_question\`, \`probe_done\`, and \`plan_init\`. Claude models also get \`send_to_user\`.
- Not available: learner-file tools (read/ls/find/grep), research, demo, visual, pdf, image display, learner-map readers, and job planning. Never call them and never pretend to run them. When something genuinely needs one, say plainly what you cannot do here and teach from what you know.
- \`plan_init\` renders the map as a card in the transcript; tapping it opens the full map. Statuses are derived from the \`nodeId\` tags on your checks.
- With \`send_to_user\`, every learner-facing message MUST go through it. Without it, ordinary reply text IS the delivery channel — never wrap it in a tool call or a JSON envelope.
- Questions render as interactive cards: options, confidence, a thinking field, and a skip. Their answers arrive as the call's result; never ask the learner to type an answer to a question tool as chat text.

Everything else — the teaching method, the probe, the plan, the honesty rules, the voice, the markdown and LaTeX contract — applies exactly as written.`;

const PRACTICE_BUILD = `# This build

This build has no tools. Never emit a tool call, a JSON envelope, or a request to run code — the learner cannot receive any of it. Write your reply directly; questions and exercises go in prose, then stop and wait.`;

const PRACTICE_NOTE = `# Practice on mobile

This is a practice session. Pose exactly one exercise at a time, with its full statement and (when useful) the answer format. Stop after asking. When the learner answers, grade it honestly, explain the mistake precisely, and only then move to the next exercise. Keep a running sense of which skills are solid and which need another rep.`;

export type MobileSessionKind = "teach" | "practice";
export type MobilePhase = "probe" | "teach";

const SHARED = [voice, accuracy, mentalModel, questionTools, confidence, sideConversations, formatting];
const cache = new Map<string, string>();

/** The prober's prompt: identity → build facts → probe doctrine → shared law. */
function probePrompt(mechanic: QuestionMechanic): string {
	const quizzing =
		mechanic === "free"
			? "While probing, the free-recall tool is \`recall\` — no options, no type, no nodeId."
			: "While probing, the multiple-choice tool is \`probe\` — no options list type, no type field, no nodeId.";
	return [base, MOBILE_BUILD, probeDoctrine, quizzing, ...SHARED].join("\n\n---\n\n");
}

/** The teacher's prompt: identity → build facts → method/plan/teaching → shared law. */
function teachPrompt(mechanic: QuestionMechanic): string {
	const quizzing =
		mechanic === "free"
			? "Teaching uses the free-recall tool \`explain\`; every call carries \`type\` and a \`nodeId\` from the live plan."
			: "Teaching uses the multiple-choice tool \`quiz\`; every call carries \`type\` and a \`nodeId\` from the live plan.";
	return [base, MOBILE_BUILD, method, planning, teaching, predictions, questionPrinciples, quizzing, ...SHARED].join(
		"\n\n---\n\n",
	);
}

/** The agent prompt for a teaching session's current phase. */
export function mobileAgentPrompt(phase: MobilePhase, mechanic: QuestionMechanic): string {
	const key = `${phase}:${mechanic}`;
	const cached = cache.get(key);
	if (cached) return cached;
	const prompt = phase === "probe" ? probePrompt(mechanic) : teachPrompt(mechanic);
	cache.set(key, prompt);
	return prompt;
}

/** Practice sessions stay single-phase and tool-less for now. */
export function mobileSystemPrompt(kind: MobileSessionKind): string {
	const key = `kind:${kind}`;
	const cached = cache.get(key);
	if (cached) return cached;
	const prompt =
		kind === "practice"
			? [base, PRACTICE_BUILD, PRACTICE_NOTE, method, teaching, predictions, voice, accuracy, mentalModel, sideConversations, formatting].join(
					"\n\n---\n\n",
				)
			: teachPrompt("choice");
	cache.set(key, prompt);
	return prompt;
}
