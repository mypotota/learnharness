import { useMemo, useState, useSyncExternalStore } from "react";
import { CheckIcon, ChevronDownIcon, ChevronLeftIcon, SearchIcon } from "lucide-react";
import { useI18n } from "../platform/i18n-provider";
import { MOBILE_STRINGS } from "../strings";
import { BottomSheet, SheetOption } from "./bottom-sheet";
import { cn } from "@/lib/utils";
import {
	catalog,
	customConfigValue,
	defaultThinkingLevel,
	discoverCustomModels,
	findModel,
	providerLabel,
	providerRows,
	removeProviderKey,
	saveCustomConfig,
	selectedModel,
	setProviderKey,
	setSelectedModel,
	subscribeModels,
	supportedLevelsFor,
	modelsVersion,
	type CatalogModel,
	type CustomProviderConfig,
	type ProviderRow,
} from "../engine/registry";

type Sheet = null | "providers" | "models" | "thinking";

function SearchField({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder: string }) {
	return (
		<div className="mx-1 mb-2 flex items-center gap-2 rounded-xl border border-border/70 bg-background px-3">
			<SearchIcon className="size-4 shrink-0 text-muted-foreground" />
			<input
				value={value}
				onChange={(event) => onChange(event.target.value)}
				placeholder={placeholder}
				className="min-h-11 min-w-0 flex-1 bg-transparent font-prose text-(length:--lh-prose-size) outline-none placeholder:text-muted-foreground"
			/>
		</div>
	);
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
	return (
		<label className="mx-1 mb-3 block rounded-xl border border-border/70 bg-background px-3 py-2">
			<span className="mb-1 block text-[11px] uppercase tracking-wider text-muted-foreground">{label}</span>
			{children}
			{hint ? <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">{hint}</span> : null}
		</label>
	);
}

function textInput(className?: string) {
	return cn(
		"w-full bg-transparent font-prose text-(length:--lh-prose-size) outline-none placeholder:text-muted-foreground",
		className,
	);
}

function RowButton({
	label,
	value,
	onClick,
	meta,
	selected,
	disabled,
}: {
	label: string;
	value?: string;
	onClick?: () => void;
	meta?: string;
	selected?: boolean;
	disabled?: boolean;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			disabled={disabled}
			aria-pressed={selected}
			className={cn(
				"mb-0.5 flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors active:bg-accent",
				selected ? "bg-accent/60" : "hover:bg-accent/60",
				disabled && "opacity-50",
			)}
		>
			<span className="min-w-0 flex-1">
				<span className="block truncate font-prose text-(length:--lh-prose-size)">{label}</span>
				{meta ? <span className="mt-0.5 block truncate text-xs text-muted-foreground">{meta}</span> : null}
			</span>
			{value ? <span className="shrink-0 text-xs text-muted-foreground">{value}</span> : null}
			{selected ? <CheckIcon className="size-4 shrink-0 text-foreground" /> : null}
			{onClick && !selected && !value ? <ChevronDownIcon className="size-4 shrink-0 -rotate-90 text-muted-foreground" /> : null}
		</button>
	);
}

function contextLabel(model: CatalogModel): string {
	if (!model.contextWindow) return "";
	const thousands = Math.round(model.contextWindow / 1000);
	return `${thousands}K`;
}

function modelMeta(model: CatalogModel, strings: (typeof MOBILE_STRINGS)["en"]): string {
	const flags = [model.image ? strings.vision : "", model.reasoning ? strings.reasoning : ""].filter(Boolean).join(" · ");
	return strings.modelMeta(contextLabel(model), flags);
}

/** Settings → models: current model, provider keys, model picker. */
export function ModelSettingsSection() {
	const { locale } = useI18n();
	const strings = MOBILE_STRINGS[locale];
	useSyncExternalStore(subscribeModels, modelsVersion, modelsVersion);

	const rows = providerRows();
	const selection = selectedModel();
	const selected = selection ? findModel(selection) : undefined;
	const configured = rows.filter((row) => row.present).length;

	const [sheet, setSheet] = useState<Sheet>(null);
	const [providerId, setProviderId] = useState<string | null>(null);
	const [providerQuery, setProviderQuery] = useState("");
	const [modelQuery, setModelQuery] = useState("");

	const models = catalog();
	const filteredModels = useMemo(() => {
		const query = modelQuery.trim().toLowerCase();
		if (!query) return models;
		return models.filter(
			(model) =>
				model.id.toLowerCase().includes(query) ||
				model.name.toLowerCase().includes(query) ||
				providerLabel(model.provider).toLowerCase().includes(query),
		);
	}, [models, modelQuery]);

	const filteredProviders = useMemo(() => {
		const query = providerQuery.trim().toLowerCase();
		const sorted = [...rows].sort((a, b) => Number(b.present) - Number(a.present) || a.label.localeCompare(b.label));
		if (!query) return sorted;
		return sorted.filter((row) => row.label.toLowerCase().includes(query) || row.id.toLowerCase().includes(query));
	}, [rows, providerQuery]);

	// The desktop's semantics (components/thinking-default.ts): the stored
	// level wins; an unset level DISPLAYS the default-order resolution the
	// engine would run, so the picker shows the truth without writing it.
	const levels = selection ? supportedLevelsFor(selection.provider, selection.id) : [];
	const effectiveLevel = selection
		? selection.thinkingLevel ?? (selected ? defaultThinkingLevel(selected) : undefined)
		: undefined;

	const closeProviders = () => {
		setSheet(null);
		setProviderId(null);
		setProviderQuery("");
	};

	return (
		<>
			<section className="mb-5">
				<h2 className="mb-2 px-1 font-ui text-[11px] uppercase tracking-wider text-muted-foreground">{strings.models}</h2>
				<div className="overflow-hidden rounded-xl border border-border/70 bg-card/50">
					<button
						type="button"
						onClick={() => setSheet("models")}
						className="flex min-h-14 w-full items-center gap-3 px-3.5 py-2 text-left active:bg-accent"
					>
						<span className="min-w-0 flex-1 font-prose text-(length:--lh-prose-size)">{strings.currentModel}</span>
						<span className="max-w-[58%] truncate text-sm text-muted-foreground">
							{selected ? `${providerLabel(selected.provider)} · ${selected.name}` : strings.noModel}
						</span>
						<ChevronDownIcon className="size-4 shrink-0 text-muted-foreground" />
					</button>
					<div className="border-t border-border/60">
						<button
							type="button"
							onClick={() => setSheet("thinking")}
							disabled={!selection || levels.length === 0}
							className="flex min-h-14 w-full items-center gap-3 px-3.5 py-2 text-left active:bg-accent disabled:opacity-50"
						>
							<span className="min-w-0 flex-1 font-prose text-(length:--lh-prose-size)">{strings.thinkingDepth}</span>
							<span className="text-sm text-muted-foreground">{effectiveLevel ?? "—"}</span>
							<ChevronDownIcon className="size-4 shrink-0 text-muted-foreground" />
						</button>
					</div>
					<div className="border-t border-border/60">
						<button
							type="button"
							onClick={() => {
								setProviderId(null);
								setSheet("providers");
							}}
							className="flex min-h-14 w-full items-center gap-3 px-3.5 py-2 text-left active:bg-accent"
						>
							<span className="min-w-0 flex-1 font-prose text-(length:--lh-prose-size)">{strings.services}</span>
							<span className="text-sm text-muted-foreground">{strings.configuredCount(configured, rows.length)}</span>
							<ChevronDownIcon className="size-4 shrink-0 text-muted-foreground" />
						</button>
					</div>
					<div className="border-t border-border/60 px-3.5 py-3">
						<p className="text-xs leading-relaxed text-muted-foreground">{strings.modelsDescription}</p>
						<p className="mt-1 text-xs leading-relaxed text-muted-foreground">{strings.thinkingDepthHint}</p>
					</div>
				</div>
			</section>

			<BottomSheet open={sheet === "providers"} onClose={closeProviders} title={providerId ? providerLabel(providerId) : strings.services}>
				{providerId ? (
					<ProviderDetail
						provider={rows.find((row) => row.id === providerId)}
						onBack={() => {
							setProviderId(null);
							setProviderQuery("");
						}}
						onClose={closeProviders}
					/>
				) : (
					<>
						<SearchField value={providerQuery} onChange={setProviderQuery} placeholder={strings.providerSearch} />
						{filteredProviders.length === 0 ? (
							<p className="px-3 py-6 text-center text-sm text-muted-foreground">{strings.noResults}</p>
						) : (
							filteredProviders.map((row) => (
								<RowButton
									key={row.id}
									label={row.label}
									meta={row.present ? strings.modelsAvailable(row.modelCount) : strings.notConfigured}
									value={row.present ? strings.configured : undefined}
									onClick={() => setProviderId(row.id)}
								/>
							))
						)}
					</>
				)}
			</BottomSheet>

			<BottomSheet
				open={sheet === "models"}
				onClose={() => {
					setSheet(null);
					setModelQuery("");
				}}
				title={strings.chooseModel}
			>
				<SearchField value={modelQuery} onChange={setModelQuery} placeholder={strings.modelSearch} />
				{filteredModels.length === 0 ? (
					<div className="px-3 py-8 text-center">
						<p className="text-sm text-muted-foreground">{models.length === 0 ? strings.noModelsForKey : strings.noResults}</p>
						<button
							type="button"
							onClick={() => {
								setSheet("providers");
								setProviderId(null);
							}}
							className="mt-3 rounded-lg border border-border px-4 py-2 text-sm active:bg-accent"
						>
							{strings.services}
						</button>
					</div>
				) : (
					filteredModels.map((model) => (
						<RowButton
							key={`${model.provider}:${model.id}`}
							label={model.name}
							meta={`${providerLabel(model.provider)}${modelMeta(model, strings) ? ` · ${modelMeta(model, strings)}` : ""}`}
							selected={selection?.provider === model.provider && selection.id === model.id}
							onClick={() => {
								setSelectedModel({ provider: model.provider, id: model.id });
								setSheet(null);
								setModelQuery("");
							}}
						/>
					))
				)}
			</BottomSheet>

			<BottomSheet open={sheet === "thinking"} onClose={() => setSheet(null)} title={strings.thinkingDepth}>
				{levels.length === 0 ? (
					<p className="px-3 py-6 text-center text-sm text-muted-foreground">{strings.noModel}</p>
				) : (
					levels.map((level) => (
						<SheetOption
							key={level}
							label={level}
							selected={effectiveLevel === level}
							onClick={() => {
								if (!selection) return;
								setSelectedModel({ provider: selection.provider, id: selection.id, thinkingLevel: level });
								setSheet(null);
							}}
						/>
					))
				)}
			</BottomSheet>
		</>
	);
}

function ProviderDetail({
	provider,
	onBack,
	onClose,
}: {
	provider: ProviderRow | undefined;
	onBack: () => void;
	onClose: () => void;
}) {
	const { locale } = useI18n();
	const strings = MOBILE_STRINGS[locale];
	useSyncExternalStore(subscribeModels, modelsVersion, modelsVersion);
	const [query, setQuery] = useState("");

	if (!provider) return null;

	const models = catalog().filter((model) => model.provider === provider.id);
	const needle = query.trim().toLowerCase();
	const visible = needle
		? models.filter((model) => model.name.toLowerCase().includes(needle) || model.id.toLowerCase().includes(needle))
		: models;
	const selection = selectedModel();

	return (
		<>
			<button type="button" onClick={onBack} className="mx-1 mb-2 flex items-center gap-1 rounded-lg py-1 text-sm text-muted-foreground active:bg-accent">
				<ChevronLeftIcon className="size-4" />
				{strings.back}
			</button>

			{provider.custom ? (
				<CustomEndpointForm onSaved={onClose} />
			) : (
				<KeyForm provider={provider} />
			)}

			{models.length > 0 ? (
				<>
					<SearchField value={query} onChange={setQuery} placeholder={strings.modelSearch} />
					{visible.length === 0 ? (
						<p className="px-3 py-6 text-center text-sm text-muted-foreground">{strings.noResults}</p>
					) : (
						visible.map((model) => (
							<RowButton
								key={model.id}
								label={model.name}
								meta={modelMeta(model, strings)}
								selected={selection?.provider === model.provider && selection.id === model.id}
								onClick={() => {
									setSelectedModel({ provider: model.provider, id: model.id });
									onClose();
								}}
							/>
						))
					)}
				</>
			) : provider.present ? (
				<p className="px-3 py-4 text-center text-xs text-muted-foreground">{strings.noModelsForKey}</p>
			) : null}
		</>
	);
}

function KeyForm({ provider }: { provider: ProviderRow }) {
	const { locale } = useI18n();
	const strings = MOBILE_STRINGS[locale];
	const [editing, setEditing] = useState(!provider.present);
	const [draft, setDraft] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [saving, setSaving] = useState(false);
	const [confirmRemove, setConfirmRemove] = useState(false);

	const save = async () => {
		setError(null);
		setSaving(true);
		const result = await setProviderKey(provider.envVar, draft);
		setSaving(false);
		if (!result.ok) {
			setError(strings.keyInvalid);
			return;
		}
		setDraft("");
		setEditing(false);
	};

	if (!editing) {
		return (
			<div className="mx-1 mb-3 rounded-xl border border-border/70 bg-background px-3 py-3">
				<div className="flex items-center justify-between gap-3">
					<span className="min-w-0">
						<span className="block font-prose text-(length:--lh-prose-size)">{strings.configured}</span>
						<span className="mt-0.5 block truncate text-xs text-muted-foreground">{provider.envVar}</span>
					</span>
					<div className="flex shrink-0 gap-1">
						<button type="button" onClick={() => setEditing(true)} className="rounded-lg px-3 py-2 text-sm active:bg-accent">
							{strings.replace}
						</button>
						<button
							type="button"
							onClick={() => setConfirmRemove(true)}
							className="rounded-lg px-3 py-2 text-sm text-destructive active:bg-accent"
						>
							{strings.remove}
						</button>
					</div>
				</div>
				{confirmRemove ? (
					<div className="mt-3 rounded-lg border border-destructive/40 bg-destructive/5 p-3">
						<p className="text-sm font-medium">{strings.removeKeyTitle}</p>
						<p className="mt-1 text-xs leading-relaxed text-muted-foreground">{strings.removeKeyBody}</p>
						<div className="mt-3 flex justify-end gap-2">
							<button type="button" onClick={() => setConfirmRemove(false)} className="rounded-lg px-3 py-2 text-sm active:bg-accent">
								{strings.cancel}
							</button>
							<button
								type="button"
								onClick={() => {
									void removeProviderKey(provider.envVar);
									setConfirmRemove(false);
									setEditing(true);
								}}
								className="rounded-lg bg-destructive px-3 py-2 text-sm text-white active:opacity-80"
							>
								{strings.remove}
							</button>
						</div>
					</div>
				) : null}
			</div>
		);
	}

	return (
		<Field label={strings.apiKey} hint={provider.envVar}>
			<div className="flex items-center gap-2">
				<input
					value={draft}
					onChange={(event) => setDraft(event.target.value)}
					type="password"
					autoComplete="off"
					autoCapitalize="off"
					autoCorrect="off"
					spellCheck={false}
					placeholder={strings.apiKeyPlaceholder}
					className={textInput()}
				/>
				<button
					type="button"
					disabled={saving || draft.trim().length === 0}
					onClick={() => void save()}
					className="shrink-0 rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-30"
				>
					{saving ? strings.saving : strings.save}
				</button>
			</div>
			{provider.present ? (
				<button type="button" onClick={() => setEditing(false)} className="mt-2 text-xs text-muted-foreground">
					{strings.cancel}
				</button>
			) : null}
			{error ? <span className="mt-1 block text-xs text-destructive">{error}</span> : null}
		</Field>
	);
}

function splitIds(raw: string): string[] {
	return raw
		.split(/[\n,]/)
		.map((id) => id.trim())
		.filter(Boolean);
}

function CustomEndpointForm({ onSaved }: { onSaved: () => void }) {
	const { locale } = useI18n();
	const strings = MOBILE_STRINGS[locale];
	const existing = customConfigValue();
	const [baseUrl, setBaseUrl] = useState(existing?.baseUrl ?? "");
	const [keyDraft, setKeyDraft] = useState("");
	const [ids, setIds] = useState((existing?.modelIds ?? []).join(", "));
	const [discovered, setDiscovered] = useState<string[]>([]);
	const [picked, setPicked] = useState<string[]>(existing?.modelIds ?? []);
	const [discovering, setDiscovering] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [saving, setSaving] = useState(false);

	const toggle = (id: string) => {
		setPicked((current) => (current.includes(id) ? current.filter((value) => value !== id) : [...current, id]));
	};

	const discover = async () => {
		setError(null);
		setDiscovering(true);
		const result = await discoverCustomModels(baseUrl, keyDraft || null);
		setDiscovering(false);
		if (!result.ok) {
			setError(result.error);
			return;
		}
		setDiscovered(result.models);
	};

	const save = async () => {
		setError(null);
		setSaving(true);
		const config: CustomProviderConfig = {
			baseUrl,
			modelIds: [...new Set([...splitIds(ids), ...picked])],
		};
		const result = await saveCustomConfig(config, keyDraft || null);
		setSaving(false);
		if (!result.ok) {
			setError(result.error);
			return;
		}
		setKeyDraft("");
		onSaved();
	};

	return (
		<div className="mx-1 mb-3">
			<Field label={strings.baseUrl}>
				<input
					value={baseUrl}
					onChange={(event) => setBaseUrl(event.target.value)}
					type="url"
					autoCapitalize="off"
					autoCorrect="off"
					spellCheck={false}
					placeholder={strings.baseUrlPlaceholder}
					className={textInput()}
				/>
			</Field>
			<Field label={strings.apiKey} hint={strings.customKeyHint}>
				<input
					value={keyDraft}
					onChange={(event) => setKeyDraft(event.target.value)}
					type="password"
					autoComplete="off"
					autoCapitalize="off"
					autoCorrect="off"
					spellCheck={false}
					placeholder={existing ? strings.replace : strings.apiKeyPlaceholder}
					className={textInput()}
				/>
			</Field>
			<div className="mx-1 mb-2 flex items-center justify-between gap-2">
				<span className="text-xs text-muted-foreground">{strings.discoverHint}</span>
				<button
					type="button"
					onClick={() => void discover()}
					disabled={discovering || !baseUrl.trim()}
					className="shrink-0 rounded-lg border border-border px-3 py-2 text-sm active:bg-accent disabled:opacity-30"
				>
					{discovering ? strings.discovering : strings.discover}
				</button>
			</div>
			{discovered.length > 0 ? (
				<div className="mx-1 mb-3">
					<p className="mb-1 text-[11px] uppercase tracking-wider text-muted-foreground">{strings.discovered}</p>
					<div className="flex flex-wrap gap-1.5">
						{discovered.map((id) => (
							<button
								key={id}
								type="button"
								onClick={() => toggle(id)}
								aria-pressed={picked.includes(id)}
								className={cn(
									"rounded-full border px-2.5 py-1 text-xs",
									picked.includes(id) ? "border-foreground/30 bg-accent" : "border-border text-muted-foreground",
								)}
							>
								{id}
							</button>
						))}
					</div>
				</div>
			) : null}
			<Field label={strings.modelIds}>
				<textarea
					value={ids}
					onChange={(event) => setIds(event.target.value)}
					rows={2}
					autoCapitalize="off"
					autoCorrect="off"
					spellCheck={false}
					placeholder={strings.modelIdsPlaceholder}
					className={cn(textInput(), "resize-none")}
				/>
			</Field>
			{error ? <p className="mx-1 mb-2 text-xs text-destructive">{error}</p> : null}
			<button
				type="button"
				disabled={saving || !baseUrl.trim()}
				onClick={() => void save()}
				className="mx-1 w-[calc(100%-0.5rem)] rounded-xl bg-primary px-4 py-3 text-sm font-medium text-primary-foreground active:opacity-80 disabled:opacity-30"
			>
				{saving ? strings.saving : strings.save}
			</button>
		</div>
	);
}
