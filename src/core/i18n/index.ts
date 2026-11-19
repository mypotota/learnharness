/**
 * THE I18N BARREL (i18n wave, 2026-11-19): the locale vocabulary and the
 * message catalogs in one import.
 *
 * The shell (components/**) may import ONLY this module and the pure core
 * barrel — the catalogs are DATA (no IO, no node builtins), so they are
 * exempt from the import law (see eslint.config.mjs).
 */

export * from "./locales.ts";
export * from "./messages/index.ts";
