/**
 * The embedded Node runtime.
 *
 * Android has no server process, so the app ships one (`mobile/node-runtime`)
 * to host plugin backends and background jobs. It listens on loopback only;
 * the fetch rewrite in `engine/proxy.ts` carries these requests through the
 * native proxy, which is why they work despite CORS.
 */

export const NODE_PORT = 47821;

export interface NodeHealth {
	ok: boolean;
	pid: number;
	node: string;
	uptimeMs: number;
	dataDir: string;
}

let ready: Promise<NodeHealth> | null = null;
let activePort = NODE_PORT;

/** The port the runtime actually bound (it walks upward if 47821 is taken). */
export function nodeOrigin(): string {
	return `http://127.0.0.1:${activePort}`;
}

async function probe(): Promise<NodeHealth> {
	const deadline = Date.now() + 15_000;
	let last: unknown;
	while (Date.now() < deadline) {
		try {
			const response = await fetch(`http://127.0.0.1:${NODE_PORT}/health`, { cache: "no-store" });
			if (response.ok) {
				const health = (await response.json()) as NodeHealth;
				activePort = health.port ?? NODE_PORT;
				return health;
			}
			last = new Error(`node health ${response.status}`);
		} catch (error) {
			last = error;
		}
		await new Promise((resolve) => setTimeout(resolve, 250));
	}
	throw last instanceof Error ? last : new Error("node runtime did not answer");
}

/** Resolves once the runtime answers; retries while the process boots. */
export function nodeRuntime(): Promise<NodeHealth> {
	ready ??= probe().catch((error) => {
		ready = null;
		throw error;
	});
	return ready;
}

export async function nodeFetch(path: string, init?: RequestInit): Promise<Response> {
	await nodeRuntime();
	return fetch(`${nodeOrigin()}${path}`, init);
}

/** A plugin asset URL for `import()` / stylesheet tags. */
export function nodeAssetUrl(path: string): string {
	return `${nodeOrigin()}${path}`;
}
