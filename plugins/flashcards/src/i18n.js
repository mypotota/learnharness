import en from '../messages/en.json';
import zhCN from '../messages/zh-CN.json';

const catalogs = { en, 'zh-CN': zhCN };

// Resolves the activation locale's catalog (falling back to English, then the
// key itself) and substitutes {name} placeholders from the provided values.
export function createTranslator(locale) {
  const catalog = catalogs[locale] ?? en;
  return (key, values) => {
    const template = catalog[key] ?? en[key] ?? key;
    if (!values) return template;
    return template.replace(/\{(\w+)\}/g, (token, name) => (values[name] === undefined ? token : String(values[name])));
  };
}
