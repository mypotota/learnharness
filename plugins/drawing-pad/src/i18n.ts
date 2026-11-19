import en from "../messages/en.json";
import zh from "../messages/zh-CN.json";

const catalogs = { en, "zh-CN": zh } as Record<string, Record<string, string>>;
const english = catalogs.en!;
export type Translator = (key: string, values?: Record<string, string | number>) => string;

export function createTranslator(locale: string): Translator {
  const catalog = catalogs[locale] ?? english;
  return (key, values) => {
    const template = catalog[key] ?? english[key] ?? key;
    return values === undefined ? template : template.replace(/\{(\w+)\}/g, (match, name: string) =>
      Object.hasOwn(values, name) ? String(values[name]) : match);
  };
}
