/**
 * THE ERROR RESPONSE SEAM (i18n wave, 2026-11-19): the one place API error
 * bodies are built. `errorJson(code, status, params?)` replaces the old
 * hand-rolled `Response.json({ error: "…" }, { status })` — the `error`
 * field keeps the byte-exact English the API has always spoken (read from
 * the ENGLISH catalog, so the wire is locale-independent), plus the
 * `errorCode` (and `errorParams` when interpolating) the client localizes
 * from (src/core/error-codes.ts).
 *
 * `errorFields` exposes just the body object for the few sites that add
 * extra envelope fields around the error (the import route's `results`,
 * the steer envelope's `code`).
 */

import { createTranslator } from "next-intl";
import { ERROR_CODES, type ApiErrorCode } from "../core/error-codes.ts";
import { EN_MESSAGES } from "../core/i18n/messages/en.ts";
import type { MessageValues } from "../core/i18n/index.ts";

// The English voice of the API — built once from the static catalog, the
// same way the client's fallback translator is (no request scoping; the
// routes stay locale-free by design).
const EN = createTranslator({ locale: "en", messages: EN_MESSAGES });

/** The error envelope: English text + the code (+ params) the client reads. */
export function errorFields(code: ApiErrorCode, params?: MessageValues): {
	error: string;
	errorCode: ApiErrorCode;
	errorParams?: MessageValues;
} {
	const error = EN(ERROR_CODES[code] as never, params as never) as string;
	return params === undefined ? { error, errorCode: code } : { error, errorCode: code, errorParams: params };
}

/** The standard error response. Every call site passes its status — a 404
 * that quietly became a 400 must stay impossible. */
export function errorJson(code: ApiErrorCode, status: number, params?: MessageValues): Response {
	return Response.json(errorFields(code, params), { status });
}
