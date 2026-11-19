/**
 * dialog-copy.ts (i18n wave, 2026-11-19): the destructive-dialog copy
 * constants the tests pin by exact equality. The values ARE the catalog's
 * English entries — byte-identical to the pre-i18n literals — so the pins
 * hold; the DISPLAY path localizes through the catalog (components render
 * the `dialog.*` keys directly).
 */
import { EN_MESSAGES } from "./i18n/messages/index.ts";

/** The graph-traces checkbox copy (owner, 2026-09-24 flow rework — was
 *  the delete-nodes option's body in the two-button design): the
 *  graph-touching consequence says so, shared-topic survival included.
 *  Exported pure for render pins: the copy is design, not implementation. */
export const TRACES_COPY = {
	testid: "delete-traces",
	checkbox: "delete-traces-checkbox",
	title: EN_MESSAGES.dialog.tracesTitle,
	body: EN_MESSAGES.dialog.tracesBody,
} as const;

/** The 409 extraction_running line (owner phrasing, node interlude):
 *  the server's error names the extraction; the ACTIVITY DOCK is the
 *  surface the user actually watches drain. Exported pure for pins. */
export const EXTRACTION_RETRY_LINE = EN_MESSAGES.dialog.extractionRetryLine;
