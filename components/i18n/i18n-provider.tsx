"use client";

/**
 * THE I18N PROVIDER (i18n wave, 2026-11-19): the one place the app's
 * language lives on the client.
 *
 * THE ORDER OF TRUTH: an EXPLICIT choice (settings → general → language)
 * wins; without one, the OPERATING SYSTEM decides; the app never guesses
 * anything else. The server hands the first paint down (app/layout.tsx
 * reads the record), so the first frame is already in the right language.
 *
 * WHY OWN CONTEXT INSTEAD OF next-intl's useTranslations: a surface
 * rendered WITHOUT a provider (server rendering, unit tests) must still
 * produce today's English wording, not throw. The context's default value
 * is the English translator, so the ~76 UI tests that assert English text
 * keep passing untouched. next-intl's own provider is still mounted (below
 * us) so `useFormatter` and friends work — but the shell always reads
 * through `useT()`.
 */

import {
	createContext,
	useContext,
	useEffect,
	useMemo,
	useState,
	type ReactNode,
} from "react";
import { createTranslator, NextIntlClientProvider } from "next-intl";
import {
	messagesFor,
	matchOsLocale,
	type AppLocale,
	type MessageCatalog,
	type MessageKey,
	type MessageValues,
} from "@/src/core/i18n";
import { useSettingsSaved } from "@/components/settings-signal";

/** What every surface reads: the effective locale, the user's explicit
 * choice (undefined = follow the system) and the translator. */
export interface I18nValue {
	locale: AppLocale;
	explicit: AppLocale | undefined;
	t: (key: MessageKey, values?: MessageValues) => string;
}

function makeTranslator(locale: AppLocale, messages: MessageCatalog): I18nValue["t"] {
	const translator = createTranslator({ locale, messages });
	return (key, values) => translator(key as never, values as never) as string;
}

// The English translator — the fallback for every surface without a
// provider. Built once: today's wording, exactly.
const ENGLISH = makeTranslator("en", messagesFor("en"));

/**
 * The English translator, exported for the PURE helpers — the functions that
 * turn state into a sentence without rendering (a status label, a notice).
 * They take a translator as an optional argument and fall back to this one,
 * so a caller with no provider still gets today's wording, and a caller
 * inside the app passes the live one and gets the user's language.
 */
export const englishT: I18nValue["t"] = ENGLISH;

const I18nContext = createContext<I18nValue>({
	locale: "en",
	explicit: undefined,
	t: ENGLISH,
});

/** The translator. The only way the shell reads a message. */
export function useT(): I18nValue["t"] {
	return useContext(I18nContext).t;
}

/** The whole i18n value (locale, explicit choice, translator). */
export function useI18n(): I18nValue {
	return useContext(I18nContext);
}

export function I18nProvider({
	initialLocale,
	initialExplicit,
	children,
}: {
	/** The effective locale the server resolved for the first paint. */
	initialLocale: AppLocale;
	/** The record's explicit choice, if the user ever made one. */
	initialExplicit?: AppLocale;
	children: ReactNode;
}) {
	const [explicit, setExplicit] = useState<AppLocale | undefined>(initialExplicit);
	// The server's locale stands in for the OS one until the client can
	// read it for itself — the first paint must never disagree with the
	// server's markup (hydration).
	const [osLocale, setOsLocale] = useState<AppLocale>(initialLocale);
	const locale = explicit ?? osLocale;
	const messages = messagesFor(locale);
	const t = useMemo(() => makeTranslator(locale, messages), [locale, messages]);

	// <html lang> follows the effective locale.
	useEffect(() => {
		document.documentElement.lang = locale;
	}, [locale]);

	// The desktop menu follows the app's UI language (i18n wave): report
	// each change so Electron rebuilds its labels. The Android shell needs the
	// same signal for its native exit dialog.
	useEffect(() => {
		window.lh?.menuLocale?.(locale);
		(
			window as Window & {
				LhChrome?: { setLocale?: (locale: string) => void };
			}
		).LhChrome?.setLocale?.(locale);
	}, [locale]);

	// The OS locale, once the client knows it. Only matters while the user
	// has NOT chosen explicitly.
	useEffect(() => {
		const browserTags = typeof navigator !== "undefined"
			? (navigator.languages?.length ? [...navigator.languages] : navigator.language ? [navigator.language] : [])
			: [];
		const matched = matchOsLocale(browserTags);
		if (matched) setOsLocale(matched);
		const bridge = window.lh?.locale;
		if (!bridge) return;
		let alive = true;
		void bridge().then((tag) => {
			if (!alive || !tag) return;
			const electronLocale = matchOsLocale([tag]);
			if (electronLocale) setOsLocale(electronLocale);
		}).catch(() => {});
		return () => { alive = false; };
	}, []);

	// The record's choice, re-read whenever the general section lands.
	useSettingsSaved((section) => {
		if (section !== "general") return;
		void fetch("/api/settings")
			.then((res) => (res.ok ? res.json() : null))
			.then((body: { settings?: { general?: { locale?: unknown } } } | null) => {
				const value = body?.settings?.general?.locale;
				setExplicit(value === "en" || value === "zh-CN" ? value : undefined);
			})
			.catch(() => {});
	});

	const value = useMemo<I18nValue>(() => ({ locale, explicit, t }), [locale, explicit, t]);
	return (
		<I18nContext.Provider value={value}>
			<NextIntlClientProvider locale={locale} messages={messages}>
				{children}
			</NextIntlClientProvider>
		</I18nContext.Provider>
	);
}
