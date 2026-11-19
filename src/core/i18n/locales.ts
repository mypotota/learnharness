/**
 * THE LOCALE VOCABULARY (i18n wave, 2026-11-19): the two locales the app
 * ships, how a locale is recognized, and how an explicit choice beats the
 * operating system.
 *
 * PURE + browser-safe: no IO, no node builtins. The record (what the user
 * picked) lives in the settings record as `general.locale`; this module only
 * speaks the vocabulary. "The user never chose" is ABSENCE, not a value —
 * the delta settings record makes that explicit for free.
 *
 * WHY TWO LOCALES AND NOT A FREE-FORM FIELD: a locale that the app cannot
 * render is a broken setting. The list is closed; an unknown value from disk
 * is dropped (sanitizer) and an unknown value from the network is refused
 * (parser), so the app can never end up half-translated.
 */

/** The locales the app ships, in the order the settings menu lists them. */
export const APP_LOCALES = ["en", "zh-CN"] as const;

/** One shipped locale. */
export type AppLocale = (typeof APP_LOCALES)[number];

/** The locale used when nothing else matches (never "the system"). */
export const DEFAULT_LOCALE: AppLocale = "en";

/** How each locale is NAMED in the settings menu (endonyms — the user is
 * looking for their own language, not for a country code). */
export const LOCALE_LABELS: Record<AppLocale, string> = {
	en: "English",
	"zh-CN": "简体中文",
};

/** The narrow guard: is this a locale the app can actually render? */
export function isAppLocale(value: unknown): value is AppLocale {
	return typeof value === "string" && (APP_LOCALES as readonly string[]).includes(value);
}

/**
 * Match the operating system's language tags against the shipped locales.
 *
 * The order of preference:
 *   1. an EXACT tag match, case-insensitively ("zh-cn" → "zh-CN");
 *   2. the PRIMARY sub-tag ("zh" → "zh-CN", "en" → "en");
 *   3. nothing — the caller falls back to English.
 *
 * Only the primary sub-tag is mapped, and only to a locale the app ships:
 * "zh-Hans-CN" and "zh-TW" both start with "zh" → "zh-CN" (the app ships
 * Simplified Chinese only; Traditional Chinese is not in this wave).
 */
export function matchOsLocale(tags: readonly string[] | undefined): AppLocale | undefined {
	if (!tags) return undefined;
	const normalized = tags
		.map((tag) => tag.trim().toLowerCase())
		.filter((tag) => tag.length > 0);
	for (const tag of normalized) {
		for (const locale of APP_LOCALES) {
			if (locale.toLowerCase() === tag) return locale;
		}
	}
	for (const tag of normalized) {
		const primary = tag.split("-")[0];
		for (const locale of APP_LOCALES) {
			if (locale.toLowerCase().split("-")[0] === primary) return locale;
		}
	}
	return undefined;
}

/**
 * THE RESOLUTION RULE: an explicit choice wins, then the operating system,
 * then English. `explicit` is the record's `general.locale` — undefined means
 * "the user never chose" (or chose "follow the system"), so the system
 * decides.
 */
export function resolveAppLocale(
	explicit: AppLocale | undefined,
	osTags: readonly string[] | undefined,
): AppLocale {
	if (explicit) return explicit;
	return matchOsLocale(osTags) ?? DEFAULT_LOCALE;
}
