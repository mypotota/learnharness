import type { PluginFrontendContext } from "learnharness-plugin-api";
import { createTranslator, type Translator } from "./i18n.ts";
import { mountDisclosure } from "./disclosure.ts";

/** Historical questions without a model solution are never backfilled. */
export function mountModelSolution(container: HTMLElement, ui: Pick<PluginFrontendContext["ui"], "mountMarkdown">, value: unknown, signal: AbortSignal, t: Translator = createTranslator("en")): () => void {
  if (typeof value !== "string" || !/\S/.test(value)) return () => {};
  return mountDisclosure(container, "model-solution", t("solution.title"), signal, body => {
    const markdown = ui.mountMarkdown(body, { text: value }, { signal });
    return () => markdown.dispose();
  }, t);
}
