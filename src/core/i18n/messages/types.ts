/**
 * THE MESSAGE CATALOG TYPES (i18n wave, 2026-11-19): how a translation
 * catalog is shaped, and how a key is typed.
 *
 * `Translated<T>` widens every leaf of an English catalog to `string` — the
 * English catalog keeps its LITERAL types (so a key's exact wording is part
 * of the type), while every other locale is checked against it with
 * `satisfies`: a MISSING key and an EXTRA key are both compile errors.
 * The catalogs can therefore never drift apart silently.
 */

/** The English shape with every leaf widened to `string`. */
export type Translated<T> = {
	[K in keyof T]: T[K] extends string ? string : Translated<T[K]>;
};

/** Every dotted path inside a catalog ("sidebar.newChat"). */
export type NestedKeyOf<T> = T extends string
	? never
	: {
			[K in keyof T & string]: T[K] extends string ? K : `${K}.${NestedKeyOf<T[K]>}`;
		}[keyof T & string];

/** The values a message may interpolate (ICU placeholders). */
export type MessageValues = Record<string, string | number | Date | boolean>;
