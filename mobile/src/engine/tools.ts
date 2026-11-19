/**
 * The mobile tool belt.
 *
 * The desktop's tool modules cannot be imported wholesale — they pull in
 * `node:fs` through the learner-file set — so the mobile-side definitions
 * live here. The parts that ARE browser-safe and prompt-critical are
 * imported from core: schemas, validators, result placeholders and the
 * plan parser. Descriptions are copied verbatim from the desktop so the
 * model sees the same contract in both builds.
 */

import { Type } from "typebox";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { invalidInputResult, questionResult } from "@/src/agent/tool-execute.ts";
import {
	askInputSchema,
	askOptionProblems,
	explainInputBase,
	explainInputObject,
	explainInputProblems,
	parseOptionsIfString,
	probeQuizInputSchema,
	quizInputObject,
	quizInputProblems,
} from "@/src/core/question-core.ts";
import { probeDoneInputSchema, PROBE_DONE_ACK_TEXT } from "@/src/core/contracts/probe.ts";
import { createTree, PlanTreeError } from "@/src/core/plan-tree.ts";
import { hasProbeDone, hasUnresolvedQuestion, type LhMessage } from "@/src/core/native-messages.ts";
import { parseMermaidPlan } from "@/src/agent/tools/mermaid-plan.ts";
import { sendToUserTool, needsSendToUser } from "@/src/agent/tools/send-to-user.ts";
import type { Api, Model } from "@earendil-works/pi-ai";
import { getSession, saveTree } from "../store";

export type QuestionMechanic = "choice" | "free";

/** GLM wobble guard — same as the desktop: options sometimes arrive as a
 *  JSON-encoded string; heal before schema validation. */
function prepareQuestionArguments<T extends object>(args: unknown): T {
	if (args && typeof args === "object" && !Array.isArray(args)) {
		const o = args as { options?: unknown };
		if (typeof o.options === "string") {
			const parsed = parseOptionsIfString(o.options);
			if (parsed !== o.options) return { ...o, options: parsed } as T;
		}
		return o as T;
	}
	return args as T;
}

/** Copied verbatim from the desktop (src/agent/tools.ts). */
const quizExampleBody = {
	question: "A signal is $y=\\sin(2x)$ and $\\frac{dx}{dt}=3$. What is $\\frac{dy}{dt}$?",
	options: [
		{ label: "$6\\cos(2x)$", value: "a" },
		{ label: "$2\\cos(2x)$", value: "b" },
		{ label: "$3\\cos(2x)$", value: "c" },
	],
	explanation:
		"The phase changes twice as fast as $x$; multiply by the sine's slope:\n$$\n\\frac{dy}{dt}=\\cos(2x)\\cdot2\\cdot3=6\\cos(2x)\n$$",
	correctAnswer: "a",
};

function quizDescription(delta: { name: "quiz" | "probe"; nodeId: boolean; types: boolean }): string {
	const base =
		"Ask the learner a GRADED question with a known correct answer, then instantly grade and give feedback. " +
		"Unlike ask_user_question (which collects preferences/decisions with no right answer), " +
		delta.name +
		" always has a " +
		"correct answer supplied by you, marks the learner's selection right/wrong, reveals the correct answer, and " +
		"can show an explanation. Options-only: single-select or multi-select, plus an automatic 'I don't know' " +
		"choice so the learner can signal a genuine gap instead of guessing. An always-present optional thinking " +
		"field lets the learner attach his reasoning to ANY answer; it reaches you only when non-empty. " +
		"No free-text answers — for non-graded questions use ask_user_question instead. " +
		(delta.types
			? "Every call declares `type` — the question's role in the teaching cycle; the field's own description says when each kind fires. "
			: "") +
		(delta.nodeId
			? "Set `nodeId` (required) to the plan node this question is about — validated at call time against the session's plan map. For off-map checks use ask_user_question. "
			: "") +
		"ONE question per turn: call a single " +
		delta.name +
		", then end your turn — his answer determines the next.";
	const example = delta.nodeId ? { type: "check" as const, nodeId: "chain-rule", ...quizExampleBody } : quizExampleBody;
	return (
		base +
		"\nExample arguments — copy the escaping exactly: inside JSON strings a LaTeX backslash is \\\\ and a newline is \\n.\n```json\n" +
		JSON.stringify(example, null, 2) +
		"\n```" +
		(delta.nodeId ? " The example's nodeId is illustrative — copy an exact id from this session's plan_init." : "")
	);
}

function explainDescription(name: "explain" | "recall", nodeId: boolean): string {
	return (
		"Ask the learner to EXPLAIN something in his own words — a graded check with NO options: he types a free-text " +
		"answer. Unlike ask_user_question (no right answer), " +
		name +
		" always has one. THE COMMITMENT RULE: " +
		"correctAnswer is the FULL correct answer in your own words, reasoning included, COMMITTED before he ever " +
		"sees the question. When his answer returns, grade it strictly against the commitment — never revise it " +
		"after seeing his words. He sees the committed answer on submit. " +
		(nodeId
			? "Set `nodeId` (required) to the plan node this question is about — validated at call time against the session's plan map. "
			: "") +
		"ONE question per turn: call a single " + name + ", then end your turn — his answer determines the next."
	);
}

const askUserQuestionTool: AgentTool<typeof askInputSchema> = {
	name: "ask_user_question",
	label: "ask_user_question",
	description:
		"Ask the learner a single question and pause until they answer. NOT graded — there is no correct answer. " +
		"Use when requirements are ambiguous, preferences are needed, a decision would materially affect the lesson, " +
		"or you need an open-ended response. ONE question per turn: call a single ask_user_question, then end your " +
		"turn — his answer determines the next.",
	parameters: askInputSchema,
	prepareArguments: prepareQuestionArguments,
	executionMode: "sequential",
	execute: async (_toolCallId, input) => {
		const problems = askOptionProblems(input.options ?? []);
		if (problems.length > 0) return invalidInputResult("ask_user_question", problems);
		return questionResult();
	},
};

const probeQuizTool: AgentTool<typeof probeQuizInputSchema> = {
	name: "probe",
	label: "probe",
	description: quizDescription({ name: "probe", nodeId: false, types: false }),
	parameters: probeQuizInputSchema,
	prepareArguments: prepareQuestionArguments,
	executionMode: "sequential",
	execute: async (_toolCallId, input) => {
		const problems = quizInputProblems(input);
		if (problems.length > 0) return invalidInputResult("probe", problems);
		return questionResult();
	},
};

const probeExplainTool: AgentTool<typeof explainInputBase> = {
	name: "recall",
	label: "recall",
	description: explainDescription("recall", false),
	parameters: explainInputBase,
	prepareArguments: prepareQuestionArguments,
	executionMode: "sequential",
	execute: async (_toolCallId, input) => {
		const problems = explainInputProblems(input);
		if (problems.length > 0) return invalidInputResult("recall", problems);
		return questionResult();
	},
};

function nodeIdProblem(sessionId: string, nodeId: string): string | null {
	const known = getSession(sessionId)?.tree?.nodes.map((node) => node.id) ?? [];
	if (known.includes(nodeId)) return null;
	return (
		`nodeId "${nodeId}" matches no node in this session's plan map. ` +
		(known.length > 0
			? `Copy one of your plan_init slugs exactly (${known.slice(0, 5).join(", ")}${known.length > 5 ? ", …" : ""}).`
			: "No plan map exists yet — call plan_init before posing quizzes.")
	);
}

function teachQuizTool(sessionId: string): AgentTool<typeof quizInputObject> {
	return {
		name: "quiz",
		label: "quiz",
		description: quizDescription({ name: "quiz", nodeId: true, types: true }),
		parameters: quizInputObject,
		prepareArguments: prepareQuestionArguments,
		executionMode: "sequential",
		execute: async (_toolCallId, input) => {
			const problems = [...quizInputProblems(input)];
			const nodeIdProblemText = nodeIdProblem(sessionId, input.nodeId);
			if (nodeIdProblemText) problems.push(nodeIdProblemText);
			if (problems.length > 0) return invalidInputResult("quiz", problems);
			return questionResult();
		},
	};
}

function teachExplainTool(sessionId: string): AgentTool<typeof explainInputObject> {
	return {
		name: "explain",
		label: "explain",
		description: explainDescription("explain", true),
		parameters: explainInputObject,
		prepareArguments: prepareQuestionArguments,
		executionMode: "sequential",
		execute: async (_toolCallId, input) => {
			const problems = [...explainInputProblems(input)];
			const nodeIdProblemText = nodeIdProblem(sessionId, input.nodeId);
			if (nodeIdProblemText) problems.push(nodeIdProblemText);
			if (problems.length > 0) return invalidInputResult("explain", problems);
			return questionResult();
		},
	};
}

const PLAN_NODE_IDS_REMINDER =
	"These are the plan's node ids — the only valid nodeId values for every quiz and explain call from here on. Reference them exactly.";

const planInitInput = Type.Object({
	mermaid: Type.String({
		minLength: 1,
		description:
			"A mermaid graph block (any direction), e.g.:\ngraph TD\n  primitives[Number primitives] --> operators[Arithmetic operators] --> expressions[Evaluating expressions]\n" +
			"The only strict rule: ids are permanent lowercase slugs (a-z, 0-9, hyphens/underscores) — checks reference them via nodeId. " +
			"Titles are free single-line text; `-->` means 'from = prerequisite' (chains fine); no subgraphs, styles, or classes.",
	}),
});

function planInitTool(sessionId: string): AgentTool<typeof planInitInput> {
	return {
		name: "plan_init",
		label: "plan_init",
		description:
			"Write or REWRITE this session's plan map — the dependency graph the learner follows live in the plan window. " +
			"Call once right after the probe concludes, to present the map; re-call whenever the map is wrong (the new block replaces the old tree). " +
			"A mermaid graph block (any direction): one node per line (`slug[Short Title]` — slugs are permanent lowercase ids: a-z, 0-9, hyphens/underscores), " +
			"`-->` edges meaning 'from must be understood before to' (chains fine). 5–15 nodes: a map, not a syllabus — one reasoning step per node, compress. " +
			"Every check you fire names the node it assesses via `nodeId`; where the lesson stands derives from those tags.",
		parameters: planInitInput,
		execute: async (_toolCallId, input) => {
			const parsed = parseMermaidPlan(input.mermaid);
			if (!parsed.ok || !parsed.plan) {
				return {
					content: [{ type: "text" as const, text: `Invalid plan map:\n${parsed.problems.join("\n")}` }],
					details: { ok: false },
					isError: true,
				};
			}
			try {
				const next = createTree(parsed.plan.nodes, parsed.plan.edges);
				saveTree(sessionId, next);
				return {
					content: [
						{
							type: "text" as const,
							text: JSON.stringify({
								ok: true,
								nodeIds: next.nodes.map((node) => node.id),
								reminder: PLAN_NODE_IDS_REMINDER,
							}),
						},
					],
					details: { ok: true, tree: next } as unknown as Record<string, unknown>,
				};
			} catch (error) {
				const message = error instanceof PlanTreeError ? error.message : error instanceof Error ? error.message : String(error);
				return {
					content: [{ type: "text" as const, text: `Invalid plan map:\n${message}` }],
					details: { ok: false },
					isError: true,
				};
			}
		},
	};
}

function probeDoneTool(sessionId: string, onConcluded: () => void): AgentTool<typeof probeDoneInputSchema> {
	return {
		name: "probe_done",
		label: "probe_done",
		description:
			"Conclude the probing phase and hand off to the teaching phase. Call this ONCE, when the probe is " +
			"complete: every strand the lesson depends on is bracketed (a floor he reliably gets right AND a " +
			"ceiling where it runs out), and his learning goal is concrete. The input IS the learner assessment — " +
			"one strand per dependency the lesson will rest on, with your read of where his edge sits on it " +
			"(floor, ceiling, misconceptions, what to build from). It streams to the learner live and becomes " +
			"the handoff artifact the teacher plans from. Refused while a question is still open, and after " +
			"the probe is already concluded. After it succeeds, say your closing sentence and end your turn.",
		parameters: probeDoneInputSchema,
		execute: async (_toolCallId, input) => {
			const session = getSession(sessionId);
			if (!session) {
				return {
					content: [{ type: "text" as const, text: 'Invalid tool input: the session no longer exists.' }],
					details: { ok: false, error: "session missing" },
					isError: true,
				};
			}
			if (hasUnresolvedQuestion(session.messages as unknown as readonly LhMessage[])) {
				return {
					content: [
						{
							type: "text" as const,
							text:
								"A question is still open — resolve it (or let him answer) before concluding the probe. " +
								"probe_done only fires with no question outstanding.",
						},
					],
					details: { ok: false, error: "open question" },
				};
			}
			if (hasProbeDone(session.messages as unknown as readonly LhMessage[])) {
				return {
					content: [{ type: "text" as const, text: "The probe is already concluded — probe_done fires exactly once." }],
					details: { ok: false, error: "already concluded" },
				};
			}
			onConcluded();
			return {
				content: [{ type: "text" as const, text: PROBE_DONE_ACK_TEXT }],
				details: { ok: true },
			};
		},
	};
}

export interface MobileToolContext {
	sessionId: string;
	phase: "probe" | "teach";
	mechanic: QuestionMechanic;
	model: Model<Api>;
	/** Fire the teacher's first turn once probe_done succeeds. */
	onProbeConcluded: () => void;
}

/** The phase-correct registry. Nothing here knows about jobs, learner files,
 *  research or demos yet — those land in later phases. */
export function createMobileTools(ctx: MobileToolContext): AgentTool<any>[] {
	const tools: AgentTool<any>[] = [askUserQuestionTool];
	if (ctx.phase === "probe") {
		tools.push(ctx.mechanic === "free" ? probeExplainTool : probeQuizTool);
		tools.push(probeDoneTool(ctx.sessionId, ctx.onProbeConcluded));
	} else {
		tools.push(ctx.mechanic === "free" ? teachExplainTool(ctx.sessionId) : teachQuizTool(ctx.sessionId));
		tools.push(planInitTool(ctx.sessionId));
		if (needsSendToUser(ctx.model)) tools.push(sendToUserTool as AgentTool<any>);
	}
	return tools;
}
