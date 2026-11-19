import { Capacitor, registerPlugin } from "@capacitor/core";

/** Keystore-backed secret store (AES/GCM, key never leaves Android). */
export interface SecureStorePlugin {
	set(options: { key: string; value: string }): Promise<void>;
	get(options: { key: string }): Promise<{ value: string | null }>;
	remove(options: { key: string }): Promise<void>;
	keys(): Promise<{ keys: string[] }>;
}

const NativeSecureStore = registerPlugin<SecureStorePlugin>("SecureStore");

const WEB_PREFIX = "lh:web-secret:";

/** Browser-only fallback so the dev server stays usable; production always
 *  runs the native store. */
function webGet(key: string): string | null {
	try {
		return localStorage.getItem(WEB_PREFIX + key);
	} catch {
		return null;
	}
}

const cache = new Map<string, string | null>();

export const SecureStore = {
	async set(key: string, value: string): Promise<void> {
		cache.set(key, value);
		if (Capacitor.isNativePlatform()) {
			await NativeSecureStore.set({ key, value });
			return;
		}
		try {
			localStorage.setItem(WEB_PREFIX + key, value);
		} catch {
			/* quota/unavailable — the in-memory copy still serves this run */
		}
	},

	async get(key: string): Promise<string | null> {
		if (cache.has(key)) return cache.get(key) ?? null;
		let value: string | null = null;
		if (Capacitor.isNativePlatform()) {
			try {
				value = (await NativeSecureStore.get({ key })).value;
			} catch {
				value = null;
			}
		} else {
			value = webGet(key);
		}
		cache.set(key, value);
		return value;
	},

	async remove(key: string): Promise<void> {
		cache.delete(key);
		if (Capacitor.isNativePlatform()) {
			await NativeSecureStore.remove({ key });
			return;
		}
		try {
			localStorage.removeItem(WEB_PREFIX + key);
		} catch {
			/* nothing to clean up */
		}
	},

	async keys(): Promise<string[]> {
		if (Capacitor.isNativePlatform()) {
			try {
				return (await NativeSecureStore.keys()).keys;
			} catch {
				return [];
			}
		}
		return Object.keys(localStorage)
			.filter((key) => key.startsWith(WEB_PREFIX))
			.map((key) => key.slice(WEB_PREFIX.length));
	},
};
