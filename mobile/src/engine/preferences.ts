/**
 * Small local preferences that are not part of the model selection.
 * The quizzing mechanic mirrors the desktop's `tools.explain` switch:
 * multiple choice (quiz/probe) or free recall (explain/recall).
 */

import { useSyncExternalStore } from "react";

export type QuestionMechanic = "choice" | "free";

const KEY = "lh:mobile:question-mechanic:v1";
const listeners = new Set<() => void>();
let cached: QuestionMechanic | null = null;

function read(): QuestionMechanic {
	if (cached) return cached;
	try {
		cached = localStorage.getItem(KEY) === "free" ? "free" : "choice";
	} catch {
		cached = "choice";
	}
	return cached;
}

export function getQuestionMechanic(): QuestionMechanic {
	return read();
}

export function setQuestionMechanic(mechanic: QuestionMechanic): void {
	cached = mechanic;
	try {
		localStorage.setItem(KEY, mechanic);
	} catch {
		/* in-memory preference still applies */
	}
	for (const listener of listeners) listener();
}

export function useQuestionMechanic(): QuestionMechanic {
	return useSyncExternalStore(
		(listener) => {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		read,
		read,
	);
}
