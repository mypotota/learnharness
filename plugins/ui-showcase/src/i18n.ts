import type { AppLocale } from "learnharness-plugin-api";
import en from "../messages/en.json";
import zh from "../messages/zh-CN.json";

const catalogs: Record<AppLocale, Record<string, string>> = { en, "zh-CN": zh };

export type Translator = (key: string, values?: Record<string, string>) => string;

export function createTranslator(locale: AppLocale): Translator {
	const catalog: Record<string, string> = catalogs[locale] ?? en;
	return (key, values) => {
		const template = catalog[key] ?? catalogs.en[key] ?? key;
		if (values === undefined) return template;
		return template.replace(/\{(\w+)\}/g, (match: string, name: string) => {
			const value = values[name];
			return value === undefined ? match : value;
		});
	};
}
