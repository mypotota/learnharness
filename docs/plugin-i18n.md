# Plugin i18n

Plugins localize their own copy. The host passes the effective UI locale to
every activation; everything else — message files, the resolver, translations
of manifest metadata — is owned by the plugin or the manifest.

## What the host gives you

`activate(context)` delivers `context.locale` (`"en"` or `"zh-CN"`), the app's
effective UI locale at activation time. A later language change applies to the
next activation, not to this window's already-mounted UI.

Manifest metadata (the name and description shown in Settings → Plugins) is
host-owned: declare optional translations in `manifest.json` and the host
renders the right one:

```json
{
  "name": "Flashcards",
  "description": "Generate fact-recall cues…",
  "translations": {
    "zh-CN": { "name": "抽认卡", "description": "从知识图谱生成记忆线索…" }
  }
}
```

Keys must be shipped app locales (`en`, `zh-CN`); absent keys fall back to the
manifest's own `name`/`description`. The field is purely additive — manifests
without it behave exactly as before.

## What the plugin bundles

Ship one flat JSON file per locale (`messages/en.json`, `messages/zh-CN.json`),
plus a ~15-line resolver in `src/i18n.ts`:

```jsonc
// messages/en.json
{ "dashboard.nextReview": "Next review: {when}" }
```

```ts
// src/i18n.ts
import en from "../messages/en.json";
import zh from "../messages/zh-CN.json";

const catalogs = { en, "zh-CN": zh } as const;
export type PluginLocale = keyof typeof catalogs;

export function createTranslator(locale: PluginLocale) {
	const messages = catalogs[locale] ?? en;
	return (key: string, values?: Record<string, string>) => {
		let text = messages[key] ?? en[key as keyof typeof en] ?? key;
		if (values) for (const [name, value] of Object.entries(values)) text = text.replaceAll(`{${name}}`, value);
		return text;
	};
}
```

Wire it at activation and thread the translator down (parameter, not global):

```ts
export function activate(context: PluginFrontendContext) {
	const t = createTranslator(context.locale);
	context.registerView({ id: "dashboard", name: t("view.dashboard"), mount(container, signal) { /* t("dashboard.nextReview", { when }) */ } });
}
```

Conventions:

- Keys are semantic (`"review.again"`), never the English wording — the wording
  changes when copy is edited; the key does not. Lower camelCase, dot separated,
  at most four segments.
- Both locale files must have identical key sets; `{name}` placeholders are the
  plugin's own convention, not host syntax.
- English is the fallback chain's floor: locale value → English value → key.
- Out of scope (stay English): model-facing prompts and backend copy, code
  identifiers, DOM selectors, CSS class names, data keys.

The SDK (`learnharness-plugin-api`) publishes the type signatures —
`PluginMessages`, `PluginTranslate` — but no runtime; the resolver above is
yours to bundle.
