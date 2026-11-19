import { useRef, type KeyboardEvent } from "react";
import { ArrowUpIcon, SquareIcon } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { useT } from "../platform/i18n-provider";
import { cn } from "@/lib/utils";

/** The mobile message input: one compact card, a send button, Enter to send.
 *  Deliberately not the desktop Composer (dictation, attachments, plugin
 *  slots) — those arrive with the real turn engine in P2. */
export function MobileComposer({
	value,
	onChange,
	onSend,
	onStop,
	busy = false,
	placeholder,
	autoFocus = false,
	className,
}: {
	value: string;
	onChange: (value: string) => void;
	onSend: () => void;
	onStop?: () => void;
	busy?: boolean;
	placeholder: string;
	autoFocus?: boolean;
	className?: string;
}) {
	const t = useT();
	const ref = useRef<HTMLTextAreaElement>(null);
	const canSend = value.trim().length > 0 && !busy;

	const send = () => {
		if (!canSend) return;
		onSend();
		ref.current?.focus();
	};

	const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
		if (event.key === "Enter" && !event.shiftKey) {
			event.preventDefault();
			send();
		}
	};

	return (
		<div className={cn("rounded-2xl border border-border/70 bg-card shadow-lg", className)}>
			<Textarea
				ref={ref}
				value={value}
				onChange={(event) => onChange(event.target.value)}
				onKeyDown={onKeyDown}
				placeholder={placeholder}
				autoFocus={autoFocus}
				rows={1}
				className="min-h-11 max-h-36 resize-none border-0 bg-transparent px-3.5 py-3 font-prose text-(length:--lh-prose-size) shadow-none placeholder:text-muted-foreground focus-visible:border-0 focus-visible:ring-0 dark:bg-transparent"
			/>
			<div className="flex justify-end px-2 pb-2">
				{busy ? (
					<button
						type="button"
						onClick={onStop}
						aria-label={t("composer.stop")}
						className="flex size-9 items-center justify-center rounded-full bg-primary text-primary-foreground active:opacity-80"
					>
						<SquareIcon className="size-3.5 fill-current" />
					</button>
				) : (
					<button
						type="button"
						onClick={send}
						disabled={!canSend}
						aria-label={t("composer.send")}
						className="flex size-9 items-center justify-center rounded-full bg-primary text-primary-foreground transition-opacity disabled:opacity-30"
					>
						<ArrowUpIcon className="size-4" />
					</button>
				)}
			</div>
		</div>
	);
}
