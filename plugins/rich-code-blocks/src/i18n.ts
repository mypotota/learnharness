import en from "../messages/en.json";
import zh from "../messages/zh-CN.json";

export type Translator = (key: string, values?: Record<string, string | number>) => string;

const catalogs: Record<string, Record<string, string>> = { en, "zh-CN": zh };
const english: Record<string, string> = en;

export function createTranslator(locale: string): Translator {
  const chosen = catalogs[locale] ?? english;
  return (key, values) => {
    const template = chosen[key] ?? english[key] ?? key;
    return values
      ? template.replace(/\{(\w+)\}/g, (placeholder, name: string) => (name in values ? String(values[name]) : placeholder))
      : template;
  };
}
