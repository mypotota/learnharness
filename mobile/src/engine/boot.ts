import { installLocalProxy } from "./proxy";
import { initModelRegistry } from "./registry";
import { NODE_PORT, nodeRuntime } from "../platform/node-runtime";

let boot: Promise<void> | null = null;

/** Starts the loopback proxy, then builds the provider catalogs. Both are
 *  idempotent; the first caller performs the work. */
export function bootEngine(): Promise<void> {
	boot ??= (async () => {
		await installLocalProxy();
		await initModelRegistry();
		void nodeRuntime()
			.then((health) => console.info(`[lh] node runtime ${health.node} on :${NODE_PORT}`))
			.catch((error) => console.warn("[lh] node runtime unavailable", error));
	})().catch((error) => {
		boot = null;
		throw error;
	});
	return boot;
}
