import type { PluginFrontendContext, PluginProblemRenderer, PluginQuestionRenderer } from "learnharness-plugin-api";
import { QUESTION_TYPE_ID, PROBLEM_TYPE_ID, type CodingPayload, type CodingQuestionPayload } from "./contract.ts";
import { mountAnswered, mountAnswerEditor, mountSubmissionEditor } from "./editor.ts";
import { createTranslator, type Translator } from "./i18n.ts";
import { mountTestResult } from "./result-view.ts";
import { mountModelSolution } from "./solution-view.ts";
import { mountSavedQuestion } from "./question-view.ts";
import { readTestResult, type CodingTestResult } from "./test-result.ts";

function mountRecordedTests(container: HTMLElement, ctx: PluginFrontendContext, outcome: { result: unknown } | { error: string }, signal: AbortSignal, headerContainer: HTMLElement | undefined, t: Translator): () => void {
  const result = "result" in outcome ? readTestResult(outcome.result) : null;
  const failure: CodingTestResult = {
    status: "error", exitCode: null, stdout: "", stderr: "", stdoutTruncated: false, stderrTruncated: false,
    message: "error" in outcome ? outcome.error : t("result.unavailable"),
  };
  return mountTestResult(container, ctx.ui, result ?? failure, signal, headerContainer, t);
}

export function activate(ctx: PluginFrontendContext): () => void {
  const t = createTranslator(ctx.locale);
  const unregisterQuestion = ctx.registerQuestionRenderer({
    id: QUESTION_TYPE_ID,
    supportedContractVersions: [1],
    mountAnswerEditor: (container, props) => mountAnswerEditor(container, props, t),
    mountAnswered(container, props) {
      if (props.signal.aborted) return;
      let questionCleanup: (() => void) | undefined;
      let codeCleanup: (() => void) | undefined;
      let resultCleanup: (() => void) | undefined;
      let solutionCleanup: (() => void) | undefined;
      const dispose = () => {
        try { questionCleanup?.(); }
        finally { try { codeCleanup?.(); } finally { try { resultCleanup?.(); } finally { solutionCleanup?.(); } } }
      };
      try {
        questionCleanup = mountSavedQuestion(container, ctx.ui, props.input.question, props.signal);
        if (props.signal.aborted) return dispose;
        codeCleanup = mountAnswered(container, props, t);
        if (props.grading !== undefined) {
          resultCleanup = mountRecordedTests(props.footerContainer ?? container, ctx, props.grading, props.signal, props.headerContainer, t);
        }
        solutionCleanup = mountModelSolution(props.footerContainer ?? container, ctx.ui, props.input.payload.modelSolution, props.signal, t);
        return dispose;
      } catch (error) { dispose(); throw error; }
    },
  } satisfies PluginQuestionRenderer<CodingQuestionPayload, string>);
  const unregisterProblem = ctx.registerProblemRenderer({
    id: PROBLEM_TYPE_ID,
    supportedContractVersions: [1],
    mountSubmissionEditor: (container, props) => mountSubmissionEditor(container, props, t),
    mountSubmitted(container, props) {
      if (props.signal.aborted) return;
      let codeCleanup: (() => void) | undefined;
      let resultCleanup: (() => void) | undefined;
      const dispose = () => { try { codeCleanup?.(); } finally { resultCleanup?.(); } };
      try {
        codeCleanup = mountAnswered(container, { input: props.input, answer: props.submission, signal: props.signal }, t);
        if (props.processing !== undefined) {
          resultCleanup = mountRecordedTests(props.footerContainer ?? container, ctx, props.processing, props.signal, props.headerContainer, t);
        }
        return dispose;
      } catch (error) { dispose(); throw error; }
    },
  } satisfies PluginProblemRenderer<CodingPayload, string>);
  return () => { try { unregisterProblem(); } finally { unregisterQuestion(); } };
}
