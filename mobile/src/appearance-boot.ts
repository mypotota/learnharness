import type { AppearanceSettings } from "@/src/core/settings";

const KEY = "lh:mobile:appearance";

/** The mobile appearance record: the desktop `AppearanceSettings` delta,
 *  kept on the device. P2 merges it into the on-device settings record. */
export function readBootAppearance(): AppearanceSettings | undefined {
	try {
		const raw = localStorage.getItem(KEY);
		if (!raw) return undefined;
		const parsed = JSON.parse(raw) as unknown;
		return parsed && typeof parsed === "object" ? (parsed as AppearanceSettings) : undefined;
	} catch {
		return undefined;
	}
}

export function persistAppearance(delta: AppearanceSettings | undefined): void {
	try {
		localStorage.setItem(KEY, JSON.stringify(delta ?? {}));
	} catch {
		/* the live provider state still applies */
	}
}
