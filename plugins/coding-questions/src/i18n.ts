import en from "../messages/en.json";
import zh from "../messages/zh-CN.json";

const catalogs: Record<string, Record<string, string>> = { en, "zh-CN": zh };

export type Translator = (key: string, values?: Record<string, string>) => string;

/** Pick the locale's catalog with an English fallback, then the key itself. */
export function createTranslator(locale: string): Translator {
  return (key, values) => {
    const catalog = catalogs[locale] ?? catalogs.en;
    const template = catalog?.[key] ?? key;
    if (values === undefined) return template;
    return template.replace(/\{(\w+)\}/g, (match, name) => values[name] ?? match);
  };
}
