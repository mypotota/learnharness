import { useEffect, useRef, type ReactNode } from "react";
import { CheckIcon, XIcon } from "lucide-react";
import { useT } from "../platform/i18n-provider";
import { pushBackHandler } from "../platform/back";
import { cn } from "@/lib/utils";

/** A modern bottom sheet: rounded top, drag handle, slide-up motion and the
 *  device's bottom safe area. Used by the settings pickers; future mobile
 *  dialogs should follow this pattern instead of native dropdowns. */
export function BottomSheet({
	open,
	onClose,
	title,
	children,
}: {
	open: boolean;
	onClose: () => void;
	title: string;
	children: ReactNode;
}) {
	const t = useT();
	const listRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!open) return;
		// A long list (themes) opens centred on the current choice, so the
		// check mark is visible without hunting.
		const frame = requestAnimationFrame(() => {
			const list = listRef.current;
			const selected = list?.querySelector<HTMLElement>('[aria-pressed="true"]');
			if (!list || !selected) return;
			const listRect = list.getBoundingClientRect();
			const selectedRect = selected.getBoundingClientRect();
			list.scrollTop += selectedRect.top - listRect.top - (list.clientHeight - selectedRect.height) / 2;
		});
		return () => cancelAnimationFrame(frame);
	}, [open]);

	useEffect(() => {
		if (!open) return;
		const onKey = (event: KeyboardEvent) => {
			if (event.key === "Escape") onClose();
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [open, onClose]);

	// The Android back gesture closes the topmost sheet before it navigates.
	useEffect(() => {
		if (!open) return;
		return pushBackHandler(() => {
			onClose();
			return true;
		});
	}, [open, onClose]);

	return (
		<div
			className={cn("fixed inset-0 z-[60]", open ? "pointer-events-auto" : "pointer-events-none")}
			aria-hidden={!open}
		>
			<button
				type="button"
				tabIndex={-1}
				aria-label={t("common.close")}
				onClick={onClose}
				className={cn(
					"absolute inset-0 bg-black/45 transition-opacity duration-200",
					open ? "opacity-100" : "opacity-0",
				)}
			/>
			<div
				role="dialog"
				aria-modal="true"
				aria-label={title}
				className={cn(
					"absolute inset-x-0 bottom-0 flex max-h-[80dvh] flex-col rounded-t-2xl border-t border-border bg-card shadow-2xl transition-transform duration-300 ease-out",
					open ? "translate-y-0" : "translate-y-full",
				)}
			>
				<div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-muted-foreground/30" aria-hidden="true" />
				<div className="flex shrink-0 items-center justify-between px-4 pb-1 pt-2">
					<h2 className="font-title text-base font-semibold">{title}</h2>
					<button type="button" onClick={onClose} aria-label={t("common.close")} className="lh-touch -mr-2 rounded-lg text-muted-foreground">
						<XIcon className="size-5" />
					</button>
				</div>
				<div ref={listRef} className="lh-scroll min-h-0 flex-1 overflow-y-auto px-2 pb-[calc(env(safe-area-inset-bottom)+10px)] pt-1">
					{children}
				</div>
			</div>
		</div>
	);
}

/** One tappable choice inside a sheet — a check mark, no native radio. */
export function SheetOption({
	label,
	description,
	selected,
	onClick,
}: {
	label: string;
	description?: string;
	selected: boolean;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			aria-pressed={selected}
			className={cn(
				"mb-0.5 flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors active:bg-accent",
				selected ? "bg-accent/60" : "hover:bg-accent/60",
			)}
		>
			<span className="min-w-0 flex-1">
				<span className="block truncate font-prose text-(length:--lh-prose-size)">{label}</span>
				{description ? <span className="mt-0.5 block text-xs text-muted-foreground">{description}</span> : null}
			</span>
			{selected && <CheckIcon className="size-4 shrink-0 text-foreground" />}
		</button>
	);
}
