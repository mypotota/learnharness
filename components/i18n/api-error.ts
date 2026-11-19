/**
 * THE API-ERROR SEAM'S CLIENT SIDE (i18n wave, 2026-11-19): turn an API
 * error body into the user's language. A known `errorCode` reads the
 * `error` area of the live catalogs (through whichever translator the
 * caller already holds); anything else falls back to the wire's original
 * English `error` text — exactly what the surface showed before this
 * wave. The API itself stays locale-independent.
 */

import { ERROR_CODES, isApiErrorCode } from "@/src/core";
import type { MessageKey, MessageValues } from "@/src/core/i18n";

type Translate = (key: MessageKey, values?: MessageValues) => string;

/** The localized message for a parsed response body, or undefined when the
 * body carries no usable error text. */
export function apiErrorMessage(t: Translate, body: unknown): string | undefined {
	if (!body || typeof body !== "object") return undefined;
	const { error, errorCode, errorParams } = body as { error?: unknown; errorCode?: unknown; errorParams?: unknown };
	if (isApiErrorCode(errorCode)) return t(ERROR_CODES[errorCode], errorParams as MessageValues | undefined);
	return typeof error === "string" ? error : undefined;
}
