/**
 * The mobile plugin UI host.
 *
 * Plugin frontends receive a controlled, React-backed implementation of the
 * desktop's `PluginUi`: widget mounts, overlays (menu/dialog/surface) rendered
 * as bottom sheets, and back-gesture participation. Anything the phone cannot
 * honestly provide (knowledge graph, dictation) degrades to an inert or empty
 * control instead of silently pretending.
 */

import { createRoot, type Root } from "react-dom/client";
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import type { ThinkingLevel } from "@earendil-works/pi-agent-core";
import type {
	PluginUi,
	PluginUiCallback,
	PluginUiContent,
	PluginWidgetHandle,
	PluginWidgetOptions,
	PluginModelPickerProps,
	PluginThinkingPickerProps,
	PluginKnowledgePickerProps,
	PluginComposerProps,
	PluginDictationProps,
	PluginDictationHandle,
	PluginStandardComposerProps,
	PluginButtonProps,
	PluginBadgeProps,
	PluginMarkdownProps,
	PluginWorkerResultProps,
	PluginMenuProps,
	PluginMenuItem,
	PluginDialogProps,
	PluginSurfaceProps,
	PluginSettingsSchema,
	PluginSettingsRow,
	PluginSurfaceTarget,
} from "@/src/core/plugin-ui.ts";
import type { PluginTreeProps, PluginTreeRow, PluginTreeContent } from "@/src/core/plugin-tree.ts";
import { Markdown } from "../components/markdown";
import { catalog, supportedLevelsFor } from "../engine/registry";
import { pushBackHandler } from "../platform/back";

/* ------------------------------------------------------------------ */
/* Mounting primitives                                                 */
/* ------------------------------------------------------------------ */

interface WidgetHandle<P> extends PluginWidgetHandle<P> {}

function inertHandle<P>(initial: P): WidgetHandle<P> {
	return { update: () => {}, dispose: () => {} };
}

function mountWidget<P extends object>(
	container: HTMLElement,
	options: PluginWidgetOptions,
	initial: P,
	render: (props: P) => ReactNode,
): WidgetHandle<P> {
	if (options.signal.aborted) return inertHandle(initial);
	const root: Root = createRoot(container);
	let props = { ...initial };
	let disposed = false;
	const draw = () => root.render(render(props));
	const dispose = () => {
		if (disposed) return;
		disposed = true;
		options.signal.removeEventListener("abort", dispose);
		queueMicrotask(() => root.unmount());
	};
	draw();
	options.signal.addEventListener("abort", dispose, { once: true });
	return {
		update(next) {
			if (disposed) return;
			props = { ...props, ...next };
			draw();
		},
		dispose,
	};
}

/** Mount plugin-owned content; returns a sync cleanup. */
function mountContent(container: HTMLElement, content: PluginUiContent, signal: AbortSignal): () => void {
	if (content instanceof HTMLElement) {
		container.appendChild(content);
		return () => content.remove();
	}
	let cleaned = false;
	let cleanup: void | (() => void) = undefined;
	const runCleanup = () => {
		if (cleaned) return;
		cleaned = true;
		try {
			cleanup?.();
		} catch (error) {
			console.warn("[plugin-ui] content cleanup failed", error);
		}
	};
	const result = content(container, signal);
	Promise.resolve(result).then((value) => {
		cleanup = typeof value === "function" ? value : undefined;
		if (signal.aborted || cleaned) runCleanup();
	});
	signal.addEventListener("abort", runCleanup, { once: true });
	return () => {
		signal.removeEventListener("abort", runCleanup);
		runCleanup();
		container.replaceChildren();
	};
}

function ContentMount({ content, signal }: { content: PluginUiContent; signal: AbortSignal }) {
	const ref = useRef<HTMLDivElement>(null);
	useEffect(() => {
		if (!ref.current) return;
		return mountContent(ref.current, content, signal);
	}, [content, signal]);
	return <div ref={ref} className="min-w-0" />;
}

function TreeContent({ content, signal }: { content: PluginTreeContent; signal: AbortSignal }) {
	if (typeof content === "string") return <span className="min-w-0 break-words">{content}</span>;
	return <ContentMount content={content} signal={signal} />;
}

/* ------------------------------------------------------------------ */
/* Widgets                                                             */
/* ------------------------------------------------------------------ */

function PluginButtonWidget({ props }: { props: PluginButtonProps }) {
	const [busy, setBusy] = useState(false);
	const variant =
		props.variant === "destructive"
			? "text-red-600"
			: props.variant === "ghost" || props.variant === "link"
				? "text-muted-foreground"
				: "text-foreground";
	return (
		<button
			type="button"
			disabled={props.disabled || busy}
			title={props.title}
			aria-label={props.iconOnly ? props.label : undefined}
			onClick={() => {
				setBusy(true);
				Promise.resolve(props.onClick())
					.catch((error) => console.warn("[plugin-ui] button click failed", error))
					.finally(() => setBusy(false));
			}}
			className={`inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg border border-border/70 bg-card px-3 text-sm ${variant} active:bg-accent disabled:opacity-50`}
		>
			{props.icon ? <span className="size-4 [&_svg]:size-4" dangerouslySetInnerHTML={{ __html: props.icon }} /> : null}
			{props.iconOnly ? null : <span>{props.label}</span>}
		</button>
	);
}

function PluginBadgeWidget({ props }: { props: PluginBadgeProps }) {
	const style = props.color
		? { color: props.color, backgroundColor: `color-mix(in srgb, ${props.color} 15%, transparent)` }
		: undefined;
	return (
		<span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground" style={style}>
			{props.text}
		</span>
	);
}

function PluginMarkdownWidget({ props }: { props: PluginMarkdownProps }) {
	return <Markdown text={props.text} />;
}

function PluginSettingsRowsWidget({ schema }: { schema: PluginSettingsSchema }) {
	const [values, setValues] = useState<Record<string, unknown>>(() =>
		Object.fromEntries(schema.rows.map((row) => [row.key, row.value])),
	);
	const [errors, setErrors] = useState<Record<string, string>>({});
	const [busy, setBusy] = useState<Record<string, boolean>>({});

	useEffect(() => {
		setValues(Object.fromEntries(schema.rows.map((row) => [row.key, row.value])));
		setErrors({});
	}, [schema]);

	const commit = (row: PluginSettingsRow, value: unknown) => {
		const invalid = row.validate?.(value as never);
		const rangeError =
			(row.type === "number" || row.type === "slider") && typeof value === "number"
				? (row.min !== undefined && value < row.min) || (row.max !== undefined && value > row.max)
					? `Must be between ${row.min ?? "-∞"} and ${row.max ?? "∞"}`
					: undefined
				: undefined;
		const message = invalid || rangeError;
		if (message) {
			setErrors((current) => ({ ...current, [row.key]: message }));
			return;
		}
		setErrors((current) => ({ ...current, [row.key]: "" }));
		setValues((current) => ({ ...current, [row.key]: value }));
		setBusy((current) => ({ ...current, [row.key]: true }));
		Promise.resolve(row.onChange(value as never))
			.catch((error) => {
				setErrors((current) => ({ ...current, [row.key]: error instanceof Error ? error.message : String(error) }));
			})
			.finally(() => setBusy((current) => ({ ...current, [row.key]: false })));
	};

	return (
		<div className="divide-y divide-border/60">
			{schema.rows.map((row) => {
				const disabled = row.disabled || busy[row.key];
				const value = values[row.key];
				return (
					<div key={row.key} className="flex min-h-14 items-center gap-3 py-2">
						<div className="min-w-0 flex-1">
							<div className="font-prose text-(length:--lh-prose-size)">{row.label}</div>
							{row.description ? <div className="mt-0.5 text-xs text-muted-foreground">{row.description}</div> : null}
							{errors[row.key] ? <div className="mt-0.5 text-xs text-red-600">{errors[row.key]}</div> : null}
						</div>
						{row.type === "toggle" ? (
							<input
								type="checkbox"
								checked={Boolean(value)}
								disabled={disabled}
								onChange={(event) => commit(row, event.target.checked)}
								className="size-5 accent-foreground"
							/>
						) : row.type === "dropdown" ? (
							<select
								value={String(value ?? "")}
								disabled={disabled}
								onChange={(event) => commit(row, event.target.value)}
								className="max-w-40 rounded-md border border-border bg-card px-2 py-1 text-sm"
							>
								{row.options.map((option) => (
									<option key={option.value} value={option.value}>
										{option.label}
									</option>
								))}
							</select>
						) : row.type === "slider" ? (
							<div className="flex items-center gap-2">
								<input
									type="range"
									min={row.min}
									max={row.max}
									step={row.step ?? 1}
									value={Number(value ?? 0)}
									disabled={disabled}
									onChange={(event) => commit(row, Number(event.target.value))}
									className="w-28 accent-foreground"
								/>
								<span className="min-w-8 text-right text-sm text-muted-foreground">{String(value ?? "")}</span>
							</div>
						) : (
							<input
								type={row.type === "number" ? "number" : "text"}
								min={row.type === "number" ? row.min : undefined}
								max={row.type === "number" ? row.max : undefined}
								step={row.type === "number" ? row.step : undefined}
								value={String(value ?? "")}
								disabled={disabled}
								onChange={(event) => commit(row, row.type === "number" ? Number(event.target.value) : event.target.value)}
								className="w-28 rounded-md border border-border bg-card px-2 py-1 text-sm"
							/>
						)}
					</div>
				);
			})}
		</div>
	);
}

function PluginTreeWidget({ tree, signal }: { tree: PluginTreeProps; signal: AbortSignal }) {
	const rows = (list: readonly PluginTreeRow[], depth: number): ReactNode =>
		list.map((row) => (
			<div key={row.key}>
				<div className="flex min-h-10 items-center gap-2" style={{ paddingLeft: depth * 16 }}>
					{row.disclosure ? (
						<button
							type="button"
							aria-label={row.disclosure.label}
							onClick={() => void row.disclosure?.onChange(!row.disclosure.expanded)}
							className="flex size-6 items-center justify-center rounded text-muted-foreground"
						>
							{row.disclosure.expanded ? "▾" : "▸"}
						</button>
					) : (
						<span className="size-6" />
					)}
					{row.selection ? (
						<input
							type="checkbox"
							aria-label={row.selection.label}
							checked={row.selection.checked}
							disabled={row.selection.disabled}
							onChange={(event) => void row.selection?.onChange(event.target.checked)}
							className="size-4 accent-foreground"
						/>
					) : null}
					<div className="min-w-0 flex-1">
						<TreeContent content={row.content} signal={signal} />
					</div>
					{row.cells
						? Object.entries(row.cells).map(([key, content]) => (
								<div key={key} className="max-w-32 shrink-0 text-right text-xs text-muted-foreground">
									<TreeContent content={content} signal={signal} />
								</div>
							))
						: null}
				</div>
				{row.disclosure?.expanded && row.children ? rows(row.children, depth + 1) : null}
			</div>
		));
	return <div className="text-sm">{rows(tree.rows, 0)}</div>;
}

function PluginWorkerResultWidget({ props, signal }: { props: PluginWorkerResultProps; signal: AbortSignal }) {
	const tone =
		props.status === "succeeded" ? "text-emerald-600" : props.status === "failed" ? "text-red-600" : "text-muted-foreground";
	return (
		<div className="rounded-xl border border-border/70 bg-card/60 p-3">
			<div className="mb-1 flex items-center gap-2 text-xs">
				<span className="font-medium">{props.label}</span>
				<span className={tone}>{props.status}</span>
			</div>
			{props.text ? <Markdown text={props.text} /> : null}
			{props.content ? <ContentMount content={props.content} signal={signal} /> : null}
		</div>
	);
}

function PluginComposerWidget({ props }: { props: PluginComposerProps }) {
	const [busy, setBusy] = useState(false);
	return (
		<div className="flex items-end gap-2">
			<textarea
				value={props.value}
				placeholder={props.placeholder}
				disabled={props.busy || busy}
				onChange={(event) => void props.onChange(event.target.value)}
				className="min-h-11 flex-1 resize-none rounded-xl border border-border bg-card px-3 py-2 text-sm"
			/>
			{props.busy || busy ? (
				<button
					type="button"
					onClick={() => void props.onStop?.()}
					className="min-h-11 rounded-xl border border-border px-3 text-sm"
				>
					停止
				</button>
			) : (
				<button
					type="button"
					disabled={props.canSend === false || !props.value.trim()}
					onClick={() => {
						setBusy(true);
						Promise.resolve(props.onSend())
							.catch((error) => console.warn("[plugin-ui] send failed", error))
							.finally(() => setBusy(false));
					}}
					className="min-h-11 rounded-xl bg-foreground px-3 text-sm text-background disabled:opacity-50"
				>
					发送
				</button>
			)}
		</div>
	);
}

function PluginModelPickerWidget({ props }: { props: PluginModelPickerProps }) {
	const rows = catalog();
	const value = props.value ? `${props.value.provider}:${props.value.id}` : "";
	return (
		<select
			value={value}
			disabled={props.disabled}
			onChange={(event) => {
				const [provider, id] = event.target.value.split(":");
				if (provider && id) void props.onChange({ provider, id });
			}}
			className="max-w-full rounded-md border border-border bg-card px-2 py-1 text-sm"
		>
			<option value="" disabled>
				选择模型
			</option>
			{rows.map((row) => (
				<option key={`${row.provider}:${row.id}`} value={`${row.provider}:${row.id}`}>
					{row.name}
				</option>
			))}
		</select>
	);
}

function PluginThinkingPickerWidget({ props }: { props: PluginThinkingPickerProps }) {
	const levels = props.model ? supportedLevelsFor(props.model.provider, props.model.id) : [];
	return (
		<select
			value={props.value ?? ""}
			disabled={props.disabled || !props.model || levels.length === 0}
			onChange={(event) => {
				if (event.target.value) void props.onChange(event.target.value as ThinkingLevel);
			}}
			className="rounded-md border border-border bg-card px-2 py-1 text-sm"
		>
			<option value="" disabled>
				思考深度
			</option>
			{levels.map((level) => (
				<option key={level} value={level}>
					{level}
				</option>
			))}
		</select>
	);
}

function PluginKnowledgePickerWidget({ props }: { props: PluginKnowledgePickerProps }) {
	return (
		<div className="rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
			移动端暂无可选知识来源
			{props.value.length ? (
				<button type="button" onClick={() => void props.onChange([])} className="ml-2 underline">
					清空
				</button>
			) : null}
		</div>
	);
}

/* ------------------------------------------------------------------ */
/* Overlays                                                            */
/* ------------------------------------------------------------------ */

type OverlayKind = "menu" | "dialog" | "surface";

interface OverlayEntry {
	id: string;
	kind: OverlayKind;
	signal: AbortSignal;
	owner: symbol;
	anchor?: HTMLElement;
	label: string;
	background: "dimmed" | "opaque";
	items: PluginMenuItem[];
	content?: PluginUiContent;
	onClose?: () => void | Promise<void>;
	update(next: Partial<OverlayEntry>): void;
}

let overlays: OverlayEntry[] = [];
const overlayListeners = new Set<() => void>();

function publish() {
	for (const listener of overlayListeners) listener();
}

function subscribeOverlays(listener: () => void) {
	overlayListeners.add(listener);
	return () => overlayListeners.delete(listener);
}

function removeOverlay(id: string) {
	overlays = overlays.filter((entry) => entry.id !== id);
	publish();
}

let overlaySeed = 0;

function pushOverlay(entry: Omit<OverlayEntry, "id" | "update">): WidgetHandle<Record<string, unknown>> {
	const id = `overlay-${++overlaySeed}`;
	const target: OverlayEntry = {
		...entry,
		id,
		update(next) {
			Object.assign(target, next);
			publish();
		},
	};
	overlays = [...overlays, target];
	publish();
	const dispose = () => {
		entry.signal.removeEventListener("abort", dispose);
		removeOverlay(id);
	};
	entry.signal.addEventListener("abort", dispose, { once: true });
	return {
		update(next) {
			target.update(next as Partial<OverlayEntry>);
		},
		dispose,
	};
}

function OverlayCard({ entry }: { entry: OverlayEntry }) {
	const close = () => {
		removeOverlay(entry.id);
		Promise.resolve(entry.onClose?.()).catch((error) => console.warn("[plugin-ui] onClose failed", error));
	};
	return (
		<div className="fixed inset-0 z-[80] flex flex-col bg-black/40" role="presentation" onClick={close}>
			<div
				className={
					entry.kind === "surface"
						? "mt-3 flex min-h-0 flex-1 flex-col rounded-t-2xl bg-background shadow-xl"
						: entry.kind === "dialog"
							? "m-auto flex max-h-[85vh] w-[calc(100%-2rem)] flex-col rounded-2xl bg-background shadow-xl"
							: "mt-auto max-h-[70vh] rounded-t-2xl bg-background pb-[env(safe-area-inset-bottom)] shadow-xl"
				}
				role={entry.kind === "menu" ? "menu" : "dialog"}
				aria-label={entry.label}
				onClick={(event) => event.stopPropagation()}
			>
				<div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
					<span className="truncate text-sm font-medium">{entry.label}</span>
					<button type="button" onClick={close} className="rounded-md px-2 py-1 text-sm text-muted-foreground active:bg-accent">
						关闭
					</button>
				</div>
				<div className="lh-scroll min-h-0 flex-1 overflow-y-auto px-4 py-3">
					{entry.kind === "menu" ? (
						<div className="flex flex-col">
							{entry.items.map((item) => (
								<button
									key={item.key}
									type="button"
									role="menuitem"
									disabled={item.disabled}
									onClick={() => {
										removeOverlay(entry.id);
										Promise.resolve(item.onSelect()).catch((error) => console.warn("[plugin-ui] menu action failed", error));
									}}
									className="min-h-12 rounded-lg px-2 text-left text-sm active:bg-accent disabled:opacity-50"
								>
									{item.label}
								</button>
							))}
						</div>
					) : entry.content ? (
						<ContentMount content={entry.content} signal={entry.signal} />
					) : null}
				</div>
			</div>
		</div>
	);
}

export function PluginOverlayHost() {
	const list = useSyncExternalStore(subscribeOverlays, () => overlays, () => overlays);
	useEffect(() => {
		if (!list.length) return;
		return pushBackHandler(() => {
			const top = list[list.length - 1];
			const entry = overlays.find((item) => item.id === top.id);
			if (!entry) return false;
			removeOverlay(entry.id);
			Promise.resolve(entry.onClose?.()).catch(() => {});
			return true;
		});
	}, [list.length]);
	if (!list.length) return null;
	return (
		<>
			{list.map((entry) => (
				<OverlayCard key={entry.id} entry={entry} />
			))}
		</>
	);
}

/* ------------------------------------------------------------------ */
/* createUi                                                            */
/* ------------------------------------------------------------------ */

export function createUi(signal: AbortSignal): PluginUi {
	const inert = () => signal.aborted;
	const owner = Symbol("plugin-ui-owner");
	return {
		mountButton(container, props, options) {
			if (inert() || options.signal.aborted) return inertHandle(props);
			return mountWidget(container, options, props, (value) => <PluginButtonWidget props={value} />);
		},
		mountBadge(container, props, options) {
			if (inert() || options.signal.aborted) return inertHandle(props);
			return mountWidget(container, options, props, (value) => <PluginBadgeWidget props={value} />);
		},
		mountMarkdown(container, props, options) {
			if (inert() || options.signal.aborted) return inertHandle(props);
			return mountWidget(container, options, props, (value) => <PluginMarkdownWidget props={value} />);
		},
		mountSettingsRows(container, props, options) {
			if (inert() || options.signal.aborted) return inertHandle(props);
			return mountWidget(container, options, props, (value) => <PluginSettingsRowsWidget schema={value} />);
		},
		mountTree(container, tree, options) {
			if (inert() || options.signal.aborted) return inertHandle(tree);
			return mountWidget(container, options, tree, (value) => <PluginTreeWidget tree={value} signal={options.signal} />);
		},
		mountWorkerResult(container, props, options) {
			if (inert() || options.signal.aborted) return inertHandle(props);
			return mountWidget(container, options, props, (value) => (
				<PluginWorkerResultWidget props={value} signal={options.signal} />
			));
		},
		mountComposer(container, props, options) {
			if (inert() || options.signal.aborted) return inertHandle(props);
			return mountWidget(container, options, props, (value) => <PluginComposerWidget props={value} />);
		},
		mountModelPicker(container, props, options) {
			if (inert() || options.signal.aborted) return inertHandle(props);
			return mountWidget(container, options, props, (value) => <PluginModelPickerWidget props={value} />);
		},
		mountThinkingPicker(container, props, options) {
			if (inert() || options.signal.aborted) return inertHandle(props);
			return mountWidget(container, options, props, (value) => <PluginThinkingPickerWidget props={value} />);
		},
		mountKnowledgePicker(container, props, options) {
			if (inert() || options.signal.aborted) return inertHandle(props);
			return mountWidget(container, options, props, (value) => <PluginKnowledgePickerWidget props={value} />);
		},
		mountDictation(container, props, options): PluginDictationHandle {
			const handle = mountWidget(container, options, props, () => null);
			return { ...handle, toggle: () => {}, finish: async () => {}, cancel: () => {} };
		},
		mountStandardComposer(container, props, options) {
			if (inert() || options.signal.aborted) return inertHandle(props);
			return mountWidget(container, options, props, (value) => (
				<div className="flex flex-col gap-2">
					<PluginComposerWidget props={value.composer} />
					<div className="flex flex-wrap gap-2">
						<PluginModelPickerWidget props={value.model} />
						<PluginThinkingPickerWidget props={value.thinking} />
					</div>
				</div>
			));
		},
		openMenu(anchor, props, options) {
			if (inert() || options.signal.aborted) return inertHandle(props);
			const existing = overlays.find((entry) => entry.owner === owner && entry.anchor === anchor);
			if (existing) {
				removeOverlay(existing.id);
				Promise.resolve(existing.onClose?.()).catch(() => {});
				return inertHandle(props);
			}
			return pushOverlay({
				kind: "menu",
				signal: options.signal,
				owner,
				anchor,
				label: props.label ?? "",
				background: "dimmed",
				items: props.items,
				onClose: props.onClose,
			}) as WidgetHandle<PluginMenuProps>;
		},
		openDialog(props, options) {
			if (inert() || options.signal.aborted) return inertHandle(props);
			return pushOverlay({
				kind: "dialog",
				signal: options.signal,
				owner,
				label: props.title,
				background: "dimmed",
				items: [],
				content: props.content,
				onClose: props.onClose,
			}) as WidgetHandle<PluginDialogProps>;
		},
		openSurface(propsOrTarget: PluginSurfaceProps | PluginSurfaceTarget, maybeProps: PluginSurfaceProps | PluginWidgetOptions, maybeOptions?: PluginWidgetOptions) {
			const props = (maybeOptions ? maybeProps : propsOrTarget) as PluginSurfaceProps;
			const options = (maybeOptions ?? maybeProps) as PluginWidgetOptions;
			if (inert() || options.signal.aborted) return inertHandle(props);
			return pushOverlay({
				kind: "surface",
				signal: options.signal,
				owner,
				label: props.title,
				background: props.background ?? "dimmed",
				items: [],
				content: props.content,
				onClose: props.onClose,
			}) as WidgetHandle<PluginSurfaceProps>;
		},
	};
}
