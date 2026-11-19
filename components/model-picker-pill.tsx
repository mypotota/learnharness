"use client";

import type { ComponentProps } from "react";

/** The core and controlled plugin pickers share the very same trigger renderer. */
export function ModelPickerPill({ children, ...props }: ComponentProps<"button">) {
	return <button type="button" {...props}
		className="flex min-w-0 items-center gap-1.5 rounded-full border bg-card/85 px-2.5 py-1 font-ui text-xs shadow-lg backdrop-blur transition-colors hover:border-border hover:bg-muted max-md:min-h-9 max-md:px-3 max-md:py-1.5">
		<span className="truncate text-card-foreground">{children}</span>
		<span aria-hidden className="shrink-0 text-xs text-muted-foreground">▾</span>
	</button>;
}
