"use client";

import { useRef, type PointerEvent as ReactPointerEvent } from "react";
import { pinchedGraphView, type Viewport } from "@/components/pan-zoom";

type Point = { x: number; y: number };

interface PinchOptions {
	/** Live viewport state — snapshotted when the second finger lands. */
	view: Viewport;
	setView: (next: Viewport) => void;
	/** The fit zoom is the floor, same as the wheel/drag math. */
	floor: number;
	box: { w: number; h: number };
	size: { w: number; h: number };
	/** Stops the auto-fit from snapping back after a pinch. */
	onAdjust: () => void;
	/** Transition gating while two fingers are down. */
	onPinchChange: (active: boolean) => void;
}

/**
 * Phone pinch-to-zoom for the pan/zoom viewports — there is no wheel on a
 * touch screen. The owning component keeps single-finger dragging; this hook
 * takes over the moment a SECOND pointer lands and hands control back when
 * one lifts:
 *
 *   down(e) → true  ⇒ caller must NOT start a drag for that pointer
 *   move(e) → true  ⇒ caller must skip its pan handler
 *   up(e)   → true  ⇒ a pinch is still live (keep the panning UI on)
 */
export function usePinchZoom({ view, setView, floor, box, size, onAdjust, onPinchChange }: PinchOptions) {
	const pointers = useRef(new Map<number, Point>());
	const start = useRef<{ dist: number; mid: Point; view: Viewport } | null>(null);
	// Handlers are re-bound per render; the ref keeps the gesture reading the
	// latest view/geometry without re-registering listeners mid-pinch.
	const latest = useRef({ view, floor, box, size, setView, onAdjust, onPinchChange });
	latest.current = { view, floor, box, size, setView, onAdjust, onPinchChange };

	const local = (e: ReactPointerEvent<HTMLElement>): Point => {
		const rect = e.currentTarget.getBoundingClientRect();
		return { x: e.clientX - rect.left, y: e.clientY - rect.top };
	};

	const down = (e: ReactPointerEvent<HTMLElement>) => {
		pointers.current.set(e.pointerId, local(e));
		if (pointers.current.size < 2) return false;
		const [a, b] = [...pointers.current.values()];
		if (!a || !b) return false;
		start.current = {
			dist: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
			mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
			view: latest.current.view,
		};
		latest.current.onPinchChange(true);
		return true;
	};

	const move = (e: ReactPointerEvent<HTMLElement>) => {
		if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, local(e));
		const s = start.current;
		if (!s || pointers.current.size < 2) return false;
		const [a, b] = [...pointers.current.values()];
		if (!a || !b) return false;
		const dist = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
		const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
		const { floor: fl, box: bx, size: sz, setView: sv, onAdjust: oa } = latest.current;
		sv(pinchedGraphView(s.view, dist / s.dist, fl, s.mid, mid, bx, sz));
		oa();
		return true;
	};

	const up = (e: ReactPointerEvent<HTMLElement>) => {
		pointers.current.delete(e.pointerId);
		if (pointers.current.size >= 2) return true;
		if (start.current) {
			start.current = null;
			latest.current.onPinchChange(false);
		}
		return false;
	};

	return { down, move, up };
}
