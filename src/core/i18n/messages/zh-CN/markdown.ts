/**
 * THE MARKDOWN AREA (简体中文): 与 en/markdown.ts 一一对应。
 */

import type { Translated } from "../types.ts";
import type { markdown as EN_MARKDOWN } from "../en/markdown.ts";

export const markdown = {
	copyCode: "复制代码",
	copyTable: "复制表格",
	copyDiagram: "复制图表源码",
	copyEquation: "复制公式源码",
	expandDiagram: "展开图表",
	openFullscreen: "全屏打开图表",
/* Mermaid failure card (components/mermaid-error.tsx) + image fallback. */
	diagramFailed: "图表渲染失败",
	showDiagramSource: "显示图表源码",
	imageUnavailable: "图像不可用",
} satisfies Translated<typeof EN_MARKDOWN>;
