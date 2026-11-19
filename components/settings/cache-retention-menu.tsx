"use client";

import type { CacheRetention } from "@earendil-works/pi-ai";
import { englishT, useT } from "@/components/i18n/i18n-provider";

/** The four preferences Pi understands, and the wording for each. The
 * wording lives in the catalog; `compact` is the short form the row label
 * shows ("Cache: short"). */
const OPTIONS = [
	{ value: undefined, compact: "default", labelKey: "settings.cache.default", descriptionKey: "settings.cache.defaultHint" },
	{ value: "none", compact: "not requested", labelKey: "settings.cache.none", descriptionKey: "settings.cache.noneHint" },
	{ value: "short", compact: "short", labelKey: "settings.cache.short", descriptionKey: "settings.cache.shortHint" },
	{ value: "long", compact: "long", labelKey: "settings.cache.long", descriptionKey: "settings.cache.longHint" },
] as const;

/** The compact label's wording key, per preference. */
const COMPACT_LABEL = {
	default: "settings.cache.labelDefault",
	"not requested": "settings.cache.labelNone",
	short: "settings.cache.labelShort",
	long: "settings.cache.labelLong",
} as const;

export function cacheRetentionLabel(value: CacheRetention | undefined, t: typeof englishT = englishT): string {
	const compact = OPTIONS.find((option) => option.value === value)!.compact;
	return t(COMPACT_LABEL[compact]);
}

export function CacheRetentionMenu({ value, onPick }: {
	value: CacheRetention | undefined;
	onPick: (value: CacheRetention | undefined) => void;
}) {
	const t = useT();
	return <>
		<div className="border-b border-border px-2 pb-2">
			<p className="text-card-foreground">{t("settings.cache.title")}</p>
			<p className="mt-1 text-muted-foreground">{t("settings.cache.description")}</p>
		</div>
		{OPTIONS.map((option) => <button
			key={option.value ?? "default"}
			type="button"
			data-testid={`cache-retention-option-${option.value ?? "default"}`}
			aria-pressed={value === option.value}
			onClick={() => onPick(option.value)}
			className={`rounded-lg px-2 py-2 text-left transition-colors hover:bg-muted ${value === option.value ? "bg-muted/60" : ""}`}
		>
			<span className="flex justify-between gap-2 text-card-foreground"><span>{t(option.labelKey)}</span>{value === option.value && <span aria-hidden>✓</span>}</span>
			<span className="mt-1 block text-muted-foreground">{t(option.descriptionKey)}</span>
		</button>)}
	</>;
}
