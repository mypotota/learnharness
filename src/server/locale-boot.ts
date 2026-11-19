/**
 * THE FIRST-PAINT LOCALE (i18n wave, 2026-11-19): what app/layout.tsx puts
 * on <html lang> and hands to the i18n provider before any client code runs.
 *
 * THE ORDER OF TRUTH: the user's explicit choice (the record) wins; without
 * one, the REQUEST's language (the browser's Accept-Language, the Electron
 * app's locale) decides; English is the last resort. Read the record and
 * the request header only — the layout calls connection() first, so this
 * never bakes into a prerender.
 */

import { headers } from "next/headers";
import { resolveAppLocale, type AppLocale } from "../core/i18n/locales.ts";
import { readSettings } from "../store/settings.ts";

/** Everything the layout needs for a flash-free first paint. */
export interface LocaleBoot {
	/** The effective locale (what the UI speaks). */
	locale: AppLocale;
	/** The record's explicit choice — undefined = follow the system. */
	explicit: AppLocale | undefined;
}

/** The request's language preferences, most preferred first. */
async function acceptLanguageTags(): Promise<string[]> {
	const header = (await headers()).get("accept-language");
	if (!header) return [];
	return header
		.split(",")
		.map((part) => part.split(";")[0]?.trim() ?? "")
		.filter((tag) => tag.length > 0);
}

/** Read the record and the request; resolve the locale for the first paint. */
export async function readLocaleBoot(): Promise<LocaleBoot> {
	const explicit = readSettings()?.general?.locale;
	const tags = await acceptLanguageTags();
	return { locale: resolveAppLocale(explicit, tags), explicit };
}
