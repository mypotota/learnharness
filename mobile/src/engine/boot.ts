import { installLocalProxy } from "./proxy";
import { initModelRegistry } from "./registry";

let boot: Promise<void> | null = null;

/** Starts the loopback proxy, then builds the provider catalogs. Both are
 *  idempotent; the first caller performs the work. */
export function bootEngine(): Promise<void> {
	boot ??= (async () => {
		await installLocalProxy();
		await initModelRegistry();
	})().catch((error) => {
		boot = null;
		throw error;
	});
	return boot;
}
