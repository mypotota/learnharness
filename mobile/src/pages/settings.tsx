import { useState } from "react";
import { Capacitor } from "@capacitor/core";
import { ChevronDownIcon } from "lucide-react";
import { useAppearance } from "../platform/appearance-provider";
import { APP_LOCALES, LOCALE_LABELS } from "@/src/core/i18n";
import { useI18n, useLocaleControl, useT } from "../platform/i18n-provider";
import { persistAppearance } from "../appearance-boot";
import { BottomSheet, SheetOption } from "../components/bottom-sheet";
import { ModelSettingsSection } from "../components/model-settings";
import { MOBILE_STRINGS } from "../strings";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
	return (
		<section className="mb-5">
			<h2 className="mb-2 px-1 font-ui text-[11px] uppercase tracking-wider text-muted-foreground">{title}</h2>
			<div className="overflow-hidden rounded-xl border border-border/70 bg-card/50">{children}</div>
		</section>
	);
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
	return (
		<div className="flex min-h-14 items-center gap-3 px-3.5 py-2">
			<span className="min-w-0 flex-1 font-prose text-(length:--lh-prose-size)">{label}</span>
			{children}
		</div>
	);
}

/** The row's trailing control: current value plus the sheet affordance. */
function PickerValue({ value, onClick, label }: { value: string; onClick: () => void; label: string }) {
	return (
		<button
			type="button"
			onClick={onClick}
			aria-label={label}
			className="-mr-1.5 flex min-h-11 items-center gap-1 rounded-lg px-1.5 text-sm text-muted-foreground active:bg-accent"
		>
			{value}
			<ChevronDownIcon className="size-4" />
		</button>
	);
}

/** `/settings` — language, theme, and honest placeholders for the P2 work. */
export function SettingsPage() {
	const t = useT();
	const { locale } = useI18n();
	const strings = MOBILE_STRINGS[locale];
	const { locale: current, explicit, setExplicit } = useLocaleControl();
	const { activeTheme, delta, themes, onAppearanceChange } = useAppearance();
	const [sheet, setSheet] = useState<null | "language" | "theme">(null);

	const effectiveLocale = explicit ?? current;

	return (
		<div className="lh-scroll h-full overflow-y-auto px-4 pb-8 pt-4">
			<Section title={strings.language}>
				<Row label={strings.languageUi}>
					<PickerValue
						value={LOCALE_LABELS[effectiveLocale]}
						label={t("settings.general.language")}
						onClick={() => setSheet("language")}
					/>
				</Row>
			</Section>

			<Section title={strings.appearance}>
				<Row label={strings.theme}>
					<PickerValue value={activeTheme.name} label={strings.theme} onClick={() => setSheet("theme")} />
				</Row>
			</Section>

			<ModelSettingsSection />

			<Section title={strings.about}>
				<Row label={strings.version}>
					<span className="text-sm text-muted-foreground">0.0.1 · P1</span>
				</Row>
				<div className="border-t border-border/60">
					<Row label={strings.platform}>
						<span className="text-sm text-muted-foreground">
							{Capacitor.getPlatform()}
							{Capacitor.isNativePlatform() ? " · native" : " · web"}
						</span>
					</Row>
				</div>
			</Section>

			<BottomSheet open={sheet === "language"} onClose={() => setSheet(null)} title={strings.languageUi}>
				{APP_LOCALES.map((value) => (
					<SheetOption
						key={value}
						label={LOCALE_LABELS[value]}
						selected={effectiveLocale === value}
						onClick={() => {
							setExplicit(value);
							setSheet(null);
						}}
					/>
				))}
			</BottomSheet>

			<BottomSheet open={sheet === "theme"} onClose={() => setSheet(null)} title={strings.theme}>
				{themes.map((theme) => (
					<SheetOption
						key={theme.id}
						label={theme.name}
						description={theme.mode === "dark" ? strings.dark : strings.light}
						selected={activeTheme.id === theme.id}
						onClick={() => {
							const next = { ...delta, theme: theme.id };
							onAppearanceChange(next);
							persistAppearance(next);
							setSheet(null);
						}}
					/>
				))}
			</BottomSheet>
		</div>
	);
}
