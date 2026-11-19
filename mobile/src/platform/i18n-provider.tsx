/**
 * The mobile i18n provider — the same contracts the desktop components read
 * (`useT`, `useI18n`, `englishT`), without next-intl's Next-bound provider.
 * Messages come from the shared catalogs in `src/core/i18n`, so both apps
 * speak exactly the same wording.
 *
 * The explicit choice persists in localStorage. P2 can move it into the
 * on-device settings record without touching any surface.
 */

import {
	createContext,
	useContext,
	useEffect,
	useMemo,
	useState,
	type ReactNode,
} from "react";
import { createTranslator } from "use-intl";
import {
	matchOsLocale,
	messagesFor,
	type AppLocale,
	type MessageCatalog,
	type MessageKey,
	type MessageValues,
} from "@/src/core/i18n";

export interface I18nValue {
	locale: AppLocale;
	explicit: AppLocale | undefined;
	t: (key: MessageKey, values?: MessageValues) => string;
}

const LOCALE_KEY = "lh:mobile:locale";

function makeTranslator(locale: AppLocale, messages: MessageCatalog): I18nValue["t"] {
	const translator = createTranslator({ locale, messages });
	return (key, values) => translator(key as never, values as never) as string;
}

const ENGLISH = makeTranslator("en", messagesFor("en"));

export const englishT: I18nValue["t"] = ENGLISH;

interface MobileI18nValue extends I18nValue {
	/** The settings surface's write path; also remembers the choice. */
	setExplicit: (locale: AppLocale) => void;
}

const I18nContext = createContext<MobileI18nValue>({
	locale: "en",
	explicit: undefined,
	t: ENGLISH,
	setExplicit: () => {},
});

export function useT(): I18nValue["t"] {
	return useContext(I18nContext).t;
}

export function useI18n(): I18nValue {
	const { locale, explicit, t } = useContext(I18nContext);
	return { locale, explicit, t };
}

/** The mobile-only extra: change the app language from settings. */
export function useLocaleControl() {
	const { locale, explicit, setExplicit } = useContext(I18nContext);
	return { locale, explicit, setExplicit };
}

export function readBootLocale(): AppLocale {
	try {
		const stored = localStorage.getItem(LOCALE_KEY);
		if (stored === "en" || stored === "zh-CN") return stored;
	} catch {
		/* storage unavailable — fall through */
	}
	const os = matchOsLocale(typeof navigator === "undefined" ? [] : navigator.languages ?? [navigator.language]);
	return os ?? "zh-CN";
}

export function I18nProvider({
	initialLocale,
	initialExplicit,
	children,
}: {
	initialLocale: AppLocale;
	initialExplicit?: AppLocale;
	children: ReactNode;
}) {
	const [explicit, setExplicitState] = useState<AppLocale | undefined>(initialExplicit);
	const locale = explicit ?? initialLocale;
	const t = useMemo(() => makeTranslator(locale, messagesFor(locale)), [locale]);

	useEffect(() => {
		document.documentElement.lang = locale;
	}, [locale]);

	const setExplicit = (next: AppLocale) => {
		setExplicitState(next);
		try {
			localStorage.setItem(LOCALE_KEY, next);
		} catch {
			/* the in-memory choice still applies */
		}
	};

	const value = useMemo<MobileI18nValue>(
		() => ({ locale, explicit, t, setExplicit }),
		[locale, explicit, t],
	);
	return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}
