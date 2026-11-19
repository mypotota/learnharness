import { memo } from "react";
import { Streamdown, type PluginConfig, type StreamdownProps } from "streamdown";
import { createMathPlugin } from "@streamdown/math";
import { transformMathDelimiters } from "@/src/core/math-delims.ts";
import "katex/dist/katex.min.css";
import "streamdown/styles.css";

/** The desktop authoring contract is markdown + dollar LaTeX; Streamdown is
 *  already the desktop's renderer, so model output looks the same here. */
const plugins = {
	math: createMathPlugin({ singleDollarTextMath: true }),
} as unknown as PluginConfig;

/** Remend's incomplete-tag heuristic mangles `$a<b$`; keep its other repairs. */
const remend: StreamdownProps["remend"] = { htmlTags: false };

export const Markdown = memo(function Markdown({ text }: { text: string }) {
	// Legacy \(...\)/\[...\] authoring is converted by the same reader the
	// desktop uses; native dollar math passes through unchanged.
	return (
		<Streamdown
			className="lh-prose min-w-0 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
			plugins={plugins}
			remend={remend}
		>
			{transformMathDelimiters(text)}
		</Streamdown>
	);
});
