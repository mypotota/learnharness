"use client";

/**
 * THE LANGUAGE PICKER (i18n wave, 2026-11-19): the settings row that picks
 * the interface language.
 *
 * THREE OPTIONS, ONE MEANING EACH:
 *   - "Follow the system" — the record keeps NO locale (absence = the
 *     system decides; the label follows the OS language).
 *   - English / 简体中文 — an explicit choice, stored in the record.
 *
 * The locale names are ENDONYMS (English, 简体中文) — a user looks for their
 * own language, not for a country code — while the row's own wording comes
 * from the catalog, so the picker is readable in either language.
 */

import { useEffect, useRef, useState } from "react";
import { APP_LOCALES, LOCALE_LABELS, type AppLocale } from "@/src/core";
import { MenuShell } from "@/components/menu-shell";
import { useInteractionLayers } from "@/components/interaction-layers";
import { Hint } from "@/components/ui/hint";
import { SettingsMenuTrigger, SettingsRow } from "@/components/settings/controls";
import { useT } from "@/components/i18n/i18n-provider";

export function LanguageSetting({
	locale,
	onLocaleChange,
}: {
	/** The record's explicit choice — undefined = follow the system. */
	locale: AppLocale | undefined;
	onLocaleChange: (locale: AppLocale | undefined) => void;
}) {
	const t = useT();
	const [open, setOpen] = useState(false);
	const triggerRef = useRef<HTMLButtonElement>(null);
	const interactions = useInteractionLayers();
	const systemLabel = t("settings.general.languageSystem");
	const label = locale === undefined ? systemLabel : LOCALE_LABELS[locale];
	const options: { value: AppLocale | undefined; label: string }[] = [
		{ value: undefined, label: systemLabel },
		...APP_LOCALES.map((code) => ({ value: code, label: LOCALE_LABELS[code] })),
	];

	// Clicking away closes the menu (the shared layer owns the popup).
	useEffect(() => {
		if (!open) return;
		const onPointerDown = (event: PointerEvent) => {
			const popup = interactions.getTopLayer();
			if (popup?.kind !== "popup" || popup.anchorRef?.current !== triggerRef.current || !interactions.isElementEligible(popup.rootRef.current)) return;
			const target = event.target as Element;
			if (target instanceof Element && target.closest('[data-testid="language-menu"]')) return;
			if (!triggerRef.current?.contains(target)) setOpen(false);
		};
		document.addEventListener("pointerdown", onPointerDown);
		return () => document.removeEventListener("pointerdown", onPointerDown);
	}, [open, interactions]);

	const pick = (value: AppLocale | undefined) => {
		if (value === locale) {
			setOpen(false);
			return;
		}
		onLocaleChange(value);
		setOpen(false);
		if (interactions.isElementEligible(triggerRef.current) || interactions.isPopupOrigin(triggerRef.current)) triggerRef.current?.focus();
	};

	return (
		<SettingsRow label={t("settings.general.language")} hint={t("settings.general.languageDescription")} testid="row-language">
			<Hint label={label} side="left">
				<SettingsMenuTrigger
					ref={triggerRef}
					value={label}
					data-testid="language"
					aria-label={`${t("settings.general.language")}: ${label}`}
					aria-expanded={open}
					onClick={() => setOpen((value) => !value)}
					className="min-w-20 max-w-[65%]"
				/>
			</Hint>
			{open && (
				<MenuShell
					anchorRef={triggerRef}
					testid="language-menu"
					onClose={(reason) => { setOpen(false); if (reason === "escape") triggerRef.current?.focus(); return "closed"; }}
					preferredSide="down"
					menuClass="flex w-56 max-w-[calc(100vw-1rem)] flex-col rounded-xl border border-border bg-card p-1 text-xs shadow-xl"
				>
					{options.map((option) => {
						const selected = option.value === locale;
						return (
							<button
								key={option.value ?? "system"}
								type="button"
								role="menuitemradio"
								aria-checked={selected}
								data-testid={`language-option-${option.value ?? "system"}`}
								className="flex w-full items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-left text-card-foreground transition-colors hover:bg-accent"
								onClick={() => pick(option.value)}
							>
								<span className="min-w-0 truncate">{option.label}</span>
								{selected && <span aria-hidden className="text-muted-foreground">✓</span>}
							</button>
						);
					})}
				</MenuShell>
			)}
		</SettingsRow>
	);
}
