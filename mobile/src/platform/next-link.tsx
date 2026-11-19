import type { AnchorHTMLAttributes, ReactNode } from "react";
import { navigate } from "./next-navigation";

type LinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
	href: string;
	replace?: boolean;
	prefetch?: boolean;
	children?: ReactNode;
};

/** `next/link` stand-in: same anchor semantics, SPA navigation on same-origin
 *  clicks so the reused sidebar/session rows keep working. */
export default function Link({ href, replace, prefetch: _prefetch, onClick, children, ...rest }: LinkProps) {
	return (
		<a
			href={href}
			onClick={(event) => {
				onClick?.(event);
				if (event.defaultPrevented) return;
				if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
				if (/^[a-z]+:/i.test(href) && !href.startsWith("http")) return;
				event.preventDefault();
				navigate(href, replace);
			}}
			{...rest}
		>
			{children}
		</a>
	);
}
