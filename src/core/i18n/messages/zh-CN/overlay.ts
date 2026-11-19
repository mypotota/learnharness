/**
 * THE OVERLAY AREA (简体中文): 与 en/overlay.ts 一一对应。
 */

import type { Translated } from "../types.ts";
import type { overlay as EN_OVERLAY } from "../en/overlay.ts";

export const overlay = {
	mediaImage: "图像",
	mediaDiagram: "图表",
	focusAria: "{media}聚焦",
	fromLesson: "来自本课程",
	panZoomHint: "拖动平移 · 滚轮缩放",
	rendering: "正在渲染图表…",
	submittedImage: "提交的图像",
	zoomIn: "放大",
	zoomOut: "缩小",
	fitImage: "适配图像到视图",
	fitDiagram: "适配图表到视图",
} satisfies Translated<typeof EN_OVERLAY>;
