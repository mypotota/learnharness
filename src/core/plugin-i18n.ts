/** THE PLUGIN I18N CONTRACT (i18n wave): type-only signatures a plugin
 * implements to localize its own copy. The SDK ships these types, not a
 * runtime — each plugin bundles a ~15-line helper over its own messages
 * (see docs/plugin-i18n.md). Locale comes from the activation context. */
import type { AppLocale } from "./i18n/locales.ts";

/** A plugin's message file: flat `"<dotted.key>": "<text>"` pairs, one JSON
 * file per locale (`messages/en.json`, `messages/zh-CN.json`). Keys must
 * match across locales; values are plain prose — `{name}` style placeholders
 * are the plugin helper's own convention, not host syntax. */
export type PluginMessages = Record<string, string>;

/** Pick a message for a locale. `t(locale, "key")` resolves the locale's
 * file, falling back to English, then to the key itself. */
export type PluginTranslate = (locale: AppLocale, key: string, values?: Record<string, string>) => string;

/** The locales a plugin may receive from the host. */
export type { AppLocale };
