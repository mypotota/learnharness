/**
 * THE CATALOG LOADER (i18n wave, 2026-11-19): which catalog a locale uses,
 * and the types a translator is built from.
 *
 * Both catalogs are imported statically: the app is a local desktop/web
 * client where the bundle is on disk anyway, and a statically imported
 * catalog means the FIRST PAINT is already in the right language — no
 * flash of English, no hydration mismatch when the user chose 简体中文.
 */

import { EN_MESSAGES, type EnglishCatalog } from "./en.ts";
import { ZH_CN_MESSAGES } from "./zh-CN.ts";
import type { MessageValues, NestedKeyOf, Translated } from "./types.ts";
import type { AppLocale } from "../locales.ts";

/** A catalog with every leaf widened to `string` — what a translator takes. */
export type MessageCatalog = Translated<EnglishCatalog>;

/** Every dotted key of the catalog ("settings.general.language"). */
export type MessageKey = NestedKeyOf<EnglishCatalog>;

/** The translator every surface uses. */
export type TranslateFn = (key: MessageKey, values?: MessageValues) => string;

/** Every shipped catalog, by locale. */
export const MESSAGES: Record<AppLocale, MessageCatalog> = {
	en: EN_MESSAGES,
	"zh-CN": ZH_CN_MESSAGES,
};

/** The catalog for a locale. */
export function messagesFor(locale: AppLocale): MessageCatalog {
	return MESSAGES[locale];
}

/** The English catalog — the fallback a surface renders when it has no
 * provider (server rendering, unit tests): today's wording, exactly. */
export function defaultMessages(): MessageCatalog {
	return EN_MESSAGES;
}

export { EN_MESSAGES, ZH_CN_MESSAGES };
export type { EnglishCatalog, MessageValues, NestedKeyOf, Translated };
