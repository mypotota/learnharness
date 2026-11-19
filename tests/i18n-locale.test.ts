/**
 * Tests for the locale vocabulary (i18n wave, 2026-11-19):
 * src/core/i18n/locales.ts — the closed locale list, how the operating
 * system's language tags are matched, and the resolution rule.
 *
 * THE RULE UNDER TEST: an explicit choice wins; without one the operating
 * system decides; without that, English.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	APP_LOCALES,
	DEFAULT_LOCALE,
	LOCALE_LABELS,
	isAppLocale,
	matchOsLocale,
	resolveAppLocale,
} from "../src/core/i18n/locales.ts";

describe("the locale vocabulary", () => {
	it("ships exactly English and Simplified Chinese, in menu order", () => {
		assert.deepEqual([...APP_LOCALES], ["en", "zh-CN"]);
		assert.equal(DEFAULT_LOCALE, "en");
	});

	it("names each locale in its own language (endonyms)", () => {
		assert.equal(LOCALE_LABELS.en, "English");
		assert.equal(LOCALE_LABELS["zh-CN"], "简体中文");
	});

	it("accepts only a shipped locale", () => {
		for (const locale of APP_LOCALES) assert.equal(isAppLocale(locale), true, locale);
		for (const value of ["fr", "zh", "zh-TW", "EN", "", null, undefined, 3, {}]) {
			assert.equal(isAppLocale(value), false, String(value));
		}
	});
});

describe("matchOsLocale", () => {
	it("matches an exact tag, case-insensitively", () => {
		assert.equal(matchOsLocale(["zh-CN"]), "zh-CN");
		assert.equal(matchOsLocale(["zh-cn"]), "zh-CN");
		assert.equal(matchOsLocale(["en"]), "en");
	});

	it("falls back to the primary sub-tag", () => {
		assert.equal(matchOsLocale(["zh"]), "zh-CN");
		assert.equal(matchOsLocale(["zh-Hans"]), "zh-CN");
		assert.equal(matchOsLocale(["zh-Hans-CN"]), "zh-CN");
		assert.equal(matchOsLocale(["en"]), "en");
		assert.equal(matchOsLocale(["en-GB"]), "en");
	});

	it("prefers the FIRST tag the system lists, and skips the ones it cannot use", () => {
		assert.equal(matchOsLocale(["zh-CN", "en-US"]), "zh-CN");
		assert.equal(matchOsLocale(["fr-FR", "zh-CN"]), "zh-CN");
		assert.equal(matchOsLocale(["fr-FR", "en-US"]), "en");
	});

	it("has no answer for a language the app does not ship", () => {
		assert.equal(matchOsLocale(["fr-FR"]), undefined);
		assert.equal(matchOsLocale([]), undefined);
		assert.equal(matchOsLocale(undefined), undefined);
		assert.equal(matchOsLocale(["  "]), undefined);
	});
});

describe("resolveAppLocale", () => {
	it("lets an EXPLICIT choice beat the operating system", () => {
		assert.equal(resolveAppLocale("zh-CN", ["en-US"]), "zh-CN");
		assert.equal(resolveAppLocale("en", ["zh-CN"]), "en");
	});

	it("follows the system when the user never chose", () => {
		assert.equal(resolveAppLocale(undefined, ["zh-CN"]), "zh-CN");
		assert.equal(resolveAppLocale(undefined, ["fr-FR"]), "en");
	});

	it("falls back to English when neither the choice nor the system says anything", () => {
		assert.equal(resolveAppLocale(undefined, undefined), "en");
		assert.equal(resolveAppLocale(undefined, []), "en");
	});
});
