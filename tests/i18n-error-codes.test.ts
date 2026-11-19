/**
 * Tests for the API error-code seam (i18n wave, 2026-11-19):
 * src/core/error-codes.ts, src/server/error-response.ts and the client
 * reader components/i18n/api-error.ts. The wire contract: the `error`
 * field keeps the API's byte-exact English, `errorCode` (+ `errorParams`)
 * travels beside it, and the client renders the user's language off the
 * `error` area of the catalogs.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createTranslator } from "next-intl";
import { ERROR_CODES, isApiErrorCode } from "../src/core/error-codes.ts";
import { EN_MESSAGES, ZH_CN_MESSAGES } from "../src/core/i18n/messages/index.ts";
import type { MessageKey, MessageValues } from "../src/core/i18n/messages/index.ts";
import { errorFields, errorJson } from "../src/server/error-response.ts";
import { apiErrorMessage } from "../components/i18n/api-error.ts";

const enError = EN_MESSAGES.error;
const zhError = ZH_CN_MESSAGES.error;

describe("error-code seam", () => {
	it("every code resolves to a nonempty catalog key in every locale", () => {
		for (const [code, key] of Object.entries(ERROR_CODES)) {
			const leaf = key.slice("error.".length) as keyof typeof enError;
			assert.ok(leaf in enError, `${code}: ${key} missing from the en catalog`);
			assert.match(enError[leaf]!, /\S/, `${code}: empty en text`);
			assert.match(zhError[leaf]!, /\S/, `${code}: empty zh text`);
		}
	});

	it("every error-area key is reachable from at least one code (no orphan text)", () => {
		const covered = new Set(Object.values(ERROR_CODES));
		for (const leaf of Object.keys(enError)) {
			assert.ok(covered.has(`error.${leaf}` as never), `orphan error key: ${leaf}`);
		}
	});

	it("isApiErrorCode accepts known codes and rejects everything else", () => {
		assert.ok(isApiErrorCode("chats.unknown"));
		assert.equal(isApiErrorCode("chats.nope"), false);
		assert.equal(isApiErrorCode(42), false);
		assert.equal(isApiErrorCode(undefined), false);
	});
});

describe("errorFields / errorJson", () => {
	it("the body is { error, errorCode } — no errorParams without interpolation", () => {
		assert.deepEqual(errorFields("chats.unknown"), {
			error: "Unknown chat",
			errorCode: "chats.unknown",
		});
	});

	it("the English text is the exact catalog value (byte-for-byte)", () => {
		const body = errorFields("turns.already_running");
		assert.equal(body.error, enError.turnAlreadyRunning);
	});

	it("params are interpolated into the English text and shipped as errorParams", () => {
		const body = errorFields("stt.grant_failed", { status: "502", detail: "boom" });
		assert.equal(body.error, `Deepgram token grant failed (502): boom`);
		assert.deepEqual(body.errorParams, { status: "502", detail: "boom" });
	});

	it("errorJson carries the given status", async () => {
		const res = errorJson("side_threads.no_running_answer", 409);
		assert.equal(res.status, 409);
		assert.deepEqual(await res.json(), {
			error: "No side answer is running",
			errorCode: "side_threads.no_running_answer",
		});
	});
});

describe("apiErrorMessage (client reader)", () => {
	const zh = createTranslator({ locale: "zh-CN", messages: ZH_CN_MESSAGES });
	const t = (key: MessageKey, values?: MessageValues) => zh(key as never, values as never) as string;

	it("a known code renders the locale's text", () => {
		const body = { error: "Unknown chat", errorCode: "chats.unknown" };
		assert.equal(apiErrorMessage(t, body), zhError.unknownChat);
	});

	it("an unknown code falls back to the wire's original English", () => {
		const body = { error: "Something bespoke", errorCode: "not_a_real_code" };
		assert.equal(apiErrorMessage(t, body), "Something bespoke");
	});

	it("no code at all is today's behavior: the raw error text", () => {
		assert.equal(apiErrorMessage(t, { error: "plain english" }), "plain english");
		assert.equal(apiErrorMessage(t, {}), undefined);
		assert.equal(apiErrorMessage(t, null), undefined);
	});
});
