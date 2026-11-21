/**
 * The WebDAV client (webdav-sync wave, 2026-11-21): a deliberately small
 * subset — GET / PUT / DELETE / MKCOL over node:http(s), Basic auth, no
 * PROPFIND. The remote layout is known, so a pointer GET is the only read
 * the protocol needs.
 *
 * The deployment is plain HTTP by the owner's explicit decision; nothing
 * here upgrades, pins, or rejects it — the UI warns instead.
 */

import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import { createHash } from "node:crypto";
import type { Readable } from "node:stream";

export interface WebdavOptions {
	/** Normalized base URL ending in "/". */
	url: string;
	username: string;
	password: string;
	/** Socket inactivity timeout; large uploads on slow links need headroom. */
	idleTimeoutMs?: number;
}

export class WebdavError extends Error {
	constructor(
		message: string,
		readonly status: number | null,
		readonly detail?: string,
	) {
		super(message);
	}
}

interface ResponseInfo {
	status: number;
	headers: http.IncomingHttpHeaders;
	body: Buffer;
	location: string | null;
}

function basicAuth(username: string, password: string): string {
	return `Basic ${Buffer.from(`${username}:${password}`, "utf8").toString("base64")}`;
}

function joinUrl(base: string, relative: string): string {
	if (!relative) return base;
	const encoded = relative
		.split("/")
		.filter(Boolean)
		.map((segment) => encodeURIComponent(segment))
		.join("/");
	// Collection URIs keep their trailing slash: nginx answers 409 (not 405)
	// to a slash-less MKCOL on an existing collection.
	return `${base}${encoded}${relative.endsWith("/") ? "/" : ""}`;
}

function transport(url: URL): typeof http | typeof https {
	return url.protocol === "https:" ? https : http;
}

/** One request; resolves with the status and (bounded) response body. */
function send(
	options: WebdavOptions,
	method: string,
	relative: string,
	body?: { buffer?: Buffer; filePath?: string; size?: number },
): Promise<ResponseInfo> {
	const target = joinUrl(options.url, relative);
	let url: URL;
	try {
		url = new URL(target);
	} catch {
		return Promise.reject(new WebdavError(`invalid sync URL: ${target}`, null));
	}
	return new Promise<ResponseInfo>((resolve, reject) => {
		const headers: Record<string, string> = {
			authorization: basicAuth(options.username, options.password),
			"user-agent": "LearnHarness-Sync/1",
		};
		if (body?.buffer) headers["content-length"] = String(body.buffer.length);
		else if (body?.filePath) headers["content-length"] = String(body.size ?? fs.statSync(body.filePath).size);

		const req = transport(url).request(
			target,
			{ method, headers, timeout: options.idleTimeoutMs ?? 120_000 },
			(res) => {
				const chunks: Buffer[] = [];
				let total = 0;
				res.on("data", (chunk: Buffer) => {
					if (total < 64 * 1024) chunks.push(chunk);
					total += chunk.length;
				});
				res.on("end", () => {
					resolve({
						status: res.statusCode ?? 0,
						headers: res.headers,
						body: Buffer.concat(chunks),
						location: typeof res.headers.location === "string" ? res.headers.location : null,
					});
				});
				res.on("error", reject);
			},
		);
		req.on("timeout", () => req.destroy(new WebdavError("sync server timed out", null)));
		req.on("error", (error) => reject(error instanceof WebdavError ? error : new WebdavError(`sync request failed: ${error.message}`, null)));
		if (body?.buffer) {
			req.end(body.buffer);
		} else if (body?.filePath) {
			const stream = fs.createReadStream(body.filePath);
			stream.on("error", (error) => req.destroy(error));
			stream.pipe(req);
		} else {
			req.end();
		}
	});
}

function fail(method: string, relative: string, res: ResponseInfo): never {
	const detail = res.body.toString("utf8", 0, 400).trim();
	throw new WebdavError(`${method} ${relative} failed with HTTP ${res.status}`, res.status, detail || undefined);
}

/** GET a small JSON document; 404 resolves to null (the pointer may not
 *  exist yet). Auth/transport failures throw. */
export async function getJson(options: WebdavOptions, relative: string, maxRetries = 3): Promise<unknown | null> {
	let lastError: unknown;
	for (let attempt = 0; attempt < maxRetries; attempt += 1) {
		try {
			const res = await send(options, "GET", relative);
			if (res.status === 404) return null;
			if (res.status === 401 || res.status === 403) throw new WebdavError("sync server rejected the credentials", res.status);
			if (res.status < 200 || res.status >= 300) fail("GET", relative, res);
			return JSON.parse(res.body.toString("utf8"));
		} catch (error) {
			lastError = error;
			const retryable = error instanceof Error && /timed out|socket hang up|ECONNRESET|ENOTFOUND|EAI_AGAIN/.test(error.message);
			if (!retryable || attempt === maxRetries - 1) throw error;
			await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
		}
	}
	throw lastError;
}

/** Download a package to `destPath`, hashing and bounding the stream.
 *  Returns the byte count and sha256. */
export async function downloadFile(
	options: WebdavOptions,
	relative: string,
	destPath: string,
	maxBytes: number,
	onProgress?: (transferred: number, total: number) => void,
): Promise<{ size: number; sha256: string }> {
	const target = joinUrl(options.url, relative);
	const url = new URL(target);
	return new Promise((resolve, reject) => {
		const req = transport(url).request(
			target,
			{
				method: "GET",
				headers: { authorization: basicAuth(options.username, options.password), "user-agent": "LearnHarness-Sync/1" },
				timeout: options.idleTimeoutMs ?? 120_000,
			},
			(res) => {
				if (res.statusCode === 401 || res.statusCode === 403) {
					res.resume();
					reject(new WebdavError("sync server rejected the credentials", res.statusCode));
					return;
				}
				if (res.statusCode !== 200) {
					res.resume();
					reject(new WebdavError(`GET ${relative} failed with HTTP ${res.statusCode}`, res.statusCode ?? null));
					return;
				}
				const expected = Number(res.headers["content-length"] ?? 0);
				if (expected > maxBytes) {
					res.destroy();
					reject(new WebdavError("package exceeds the size limit", null));
					return;
				}
				const hash = createHash("sha256");
				const out = fs.createWriteStream(destPath);
				let transferred = 0;
				let aborted = false;
				res.on("data", (chunk: Buffer) => {
					transferred += chunk.length;
					if (transferred > maxBytes && !aborted) {
						aborted = true;
						res.destroy(new WebdavError("package exceeds the size limit", null));
						return;
					}
					hash.update(chunk);
					onProgress?.(transferred, expected || 0);
				});
				res.on("error", (error) => {
					out.destroy();
					reject(error);
				});
				out.on("error", reject);
				out.on("finish", () => resolve({ size: transferred, sha256: hash.digest("hex") }));
				res.pipe(out);
			},
		);
		req.on("timeout", () => req.destroy(new WebdavError("sync server timed out", null)));
		req.on("error", (error) => reject(error instanceof WebdavError ? error : new WebdavError(`download failed: ${error.message}`, null)));
		req.end();
	});
}

/** Upload a file; returns the sha256 the server received (computed while
 *  streaming, so it is the bytes that actually left this process). */
export async function uploadFile(
	options: WebdavOptions,
	relative: string,
	filePath: string,
	size: number,
	onProgress?: (transferred: number, total: number) => void,
): Promise<{ size: number; sha256: string }> {
	const target = joinUrl(options.url, relative);
	const url = new URL(target);
	const hash = createHash("sha256");
	return new Promise((resolve, reject) => {
		const req = transport(url).request(
			target,
			{
				method: "PUT",
				headers: {
					authorization: basicAuth(options.username, options.password),
					"user-agent": "LearnHarness-Sync/1",
					"content-length": String(size),
					"content-type": "application/octet-stream",
				},
				timeout: options.idleTimeoutMs ?? 120_000,
			},
			(res) => {
				const chunks: Buffer[] = [];
				res.on("data", (chunk: Buffer) => chunks.push(chunk));
				res.on("end", () => {
					if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
						resolve({ size, sha256: hash.digest("hex") });
						return;
					}
					const detail = Buffer.concat(chunks).toString("utf8", 0, 400).trim();
					reject(new WebdavError(`PUT ${relative} failed with HTTP ${res.statusCode}`, res.statusCode ?? null, detail || undefined));
				});
				res.on("error", reject);
			},
		);
		let sent = 0;
		const stream = fs.createReadStream(filePath);
		stream.on("data", (chunk: Buffer | string) => {
			const buffer = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
			hash.update(buffer);
			sent += buffer.length;
			onProgress?.(sent, size);
		});
		stream.on("error", (error) => req.destroy(error));
		req.on("timeout", () => req.destroy(new WebdavError("sync server timed out", null)));
		req.on("error", (error) => reject(error instanceof WebdavError ? error : new WebdavError(`upload failed: ${error.message}`, null)));
		stream.pipe(req);
	});
}

export async function putJson(options: WebdavOptions, relative: string, value: unknown): Promise<void> {
	const buffer = Buffer.from(`${JSON.stringify(value, null, "\t")}\n`, "utf8");
	const res = await send(options, "PUT", relative, { buffer });
	if (res.status < 200 || res.status >= 300) fail("PUT", relative, res);
}

export async function deleteFile(options: WebdavOptions, relative: string): Promise<void> {
	const res = await send(options, "DELETE", relative);
	if (res.status === 404) return;
	if (res.status < 200 || res.status >= 300) fail("DELETE", relative, res);
}

/** MKCOL is idempotent for this client: an existing collection (405) is fine. */
export async function makeCollection(options: WebdavOptions, relative: string): Promise<void> {
	const collection = relative.endsWith("/") ? relative : `${relative}/`;
	const res = await send(options, "MKCOL", collection);
	if (res.status === 405) return;
	if (res.status < 200 || res.status >= 300) fail("MKCOL", collection, res);
}

export type { Readable };
