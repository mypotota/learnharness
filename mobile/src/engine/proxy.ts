/**
 * Model-provider traffic goes through the native loopback proxy.
 *
 * Provider APIs do not grant browser origins, so a WebView fetch dies at the
 * CORS preflight before any token streams (the P0 finding). The native
 * server answers the preflight itself, forwards the request with
 * HttpURLConnection, and streams the upstream body back chunk-by-chunk. This
 * module rewrites `fetch` for remote HTTP(S) URLs only — Capacitor's own
 * local origin and the proxy itself stay untouched.
 */

import { Capacitor } from "@capacitor/core";
import { LocalProxy } from "../native/local-proxy";

interface ProxyState {
	port: number;
	token: string;
}

let state: ProxyState | null = null;
let starting: Promise<ProxyState> | null = null;
let installed = false;

function isLoopback(hostname: string): boolean {
	const host = hostname.toLowerCase();
	return host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host.endsWith(".localhost");
}

/** The app's own assets (Capacitor's local origin) and the proxy itself must
 *  never be routed back through the proxy. Every other HTTP(S) URL — including
 *  loopback endpoints such as adb-reversed test servers — is proxied, because
 *  a local endpoint may still omit CORS headers. */
function shouldProxy(url: URL, proxy: ProxyState | null): boolean {
	if (url.protocol !== "https:" && url.protocol !== "http:") return false;
	const host = url.hostname.toLowerCase();
	if (!isLoopback(host)) return true;
	const port = url.port || (url.protocol === "https:" ? "443" : "80");
	if (proxy && Number(port) === proxy.port) return false;
	// Capacitor serves the app from http(s)://localhost with no explicit port.
	// A loopback endpoint on any other port is a real provider target.
	if ((host === "localhost" || host.endsWith(".localhost")) && (url.port === "" || port === "80" || port === "443")) return false;
	return true;
}

function proxiedUrl(target: string, proxy: ProxyState): string {
	return `http://127.0.0.1:${proxy.port}/proxy?url=${encodeURIComponent(target)}`;
}

async function startProxy(): Promise<ProxyState> {
	if (state) return state;
	starting ??= LocalProxy.start()
		.then((value) => {
			state = value;
			return value;
		})
		.finally(() => {
			starting = null;
		});
	return starting;
}

/** Installs the fetch rewrite once; safe to call from any boot path. */
export async function installLocalProxy(): Promise<void> {
	if (!Capacitor.isNativePlatform() || installed) return;
	installed = true;
	try {
		await startProxy();
	} catch (error) {
		installed = false;
		throw error;
	}

	const original = globalThis.fetch.bind(globalThis);

	globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
		let request: Request;
		try {
			request = input instanceof Request ? input : new Request(input, init);
		} catch {
			return original(input as RequestInfo, init);
		}
		let url: URL;
		try {
			url = new URL(request.url);
		} catch {
			return original(request);
		}
		if (!shouldProxy(url, state)) return original(request);

		const proxy = await startProxy();
		const headers = new Headers(request.headers);
		headers.set("x-lh-proxy-token", proxy.token);
		// Model request bodies are small JSON documents. Buffering them keeps
		// the rewrite compatible with every WebView (streamed request bodies
		// need half-duplex support) without weakening response streaming.
		let body: ArrayBuffer | undefined;
		if (request.method !== "GET" && request.method !== "HEAD") {
			try {
				body = await request.arrayBuffer();
			} catch {
				body = undefined;
			}
		}
		const rewritten = new Request(proxiedUrl(request.url, proxy), {
			method: request.method,
			headers,
			body,
			signal: request.signal,
			redirect: request.redirect,
			cache: request.cache,
			credentials: "omit",
			mode: "cors",
		});
		try {
			return await original(rewritten);
		} catch (error) {
			const detail = error instanceof Error ? error.message : String(error);
			throw new Error(`Proxy request to ${url.host} failed: ${detail}`);
		}
	};
}
