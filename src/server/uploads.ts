/**
 * Browser/mobile attachment uploads (mobile-upload wave, 2026-11-21).
 *
 * The desktop app attaches files by handing their LOCAL PATHS to the agent
 * (Electron bridge). A WebView or browser has no such path — the bytes live
 * in the page. This endpoint closes that gap: bytes land inside the app's
 * data directory (never a served asset) and the agent receives the same
 * kind of absolute path the desktop flow produces.
 *
 * Same-origin only, loopback-friendly; nothing here is ever served back to
 * the browser, and the response carries paths, never file contents.
 */

import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { PATHS } from "../../config.ts";
import { subscriptionRequestOrigin } from "./desktop-access.ts";

export const UPLOADS_DIR = path.join(PATHS.data, "uploads");

const MAX_FILES = 10;
const MAX_FILE_BYTES = 50 * 1024 * 1024;
const MAX_TOTAL_BYTES = 200 * 1024 * 1024;

const HEADERS = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" };

export interface UploadedFile {
	name: string;
	path: string;
	size: number;
}

/** A filesystem-safe base name: no separators, control chars, or Windows
 *  reserved characters; bounded length; never empty. */
function safeName(name: string): string {
	const base = path.basename(name.replace(/\\/g, "/"));
	const cleaned = base.replace(/[\u0000-\u001f<>:"/\\|?*]/g, "_").trim().slice(0, 100);
	return cleaned.length > 0 ? cleaned : "file";
}

function refuse(status: number, error: string): Response {
	return Response.json({ error }, { status, headers: HEADERS });
}

/** POST /api/uploads — multipart `files` entries in, absolute paths out. */
export async function uploadFilesResponse(request: Request): Promise<Response> {
	const origin = subscriptionRequestOrigin(request);
	const supplied = request.headers.get("origin");
	if (request.method !== "POST" || !origin
		|| request.headers.get("x-learnharness-upload") !== "1"
		|| request.headers.get("sec-fetch-site") === "cross-site"
		|| (supplied !== null && supplied !== origin)) {
		return refuse(403, "Forbidden");
	}
	let form: FormData;
	try {
		form = await request.formData();
	} catch {
		return refuse(400, "Expected multipart form data");
	}
	const files = form.getAll("files").filter((entry): entry is File => entry instanceof File);
	if (files.length === 0) return refuse(400, "No files");
	if (files.length > MAX_FILES) return refuse(400, `At most ${MAX_FILES} files per upload`);
	let total = 0;
	for (const file of files) {
		if (file.size > MAX_FILE_BYTES) return refuse(413, `${file.name} exceeds ${MAX_FILE_BYTES / 1024 / 1024} MB`);
		total += file.size;
	}
	if (total > MAX_TOTAL_BYTES) return refuse(413, `Uploads exceed ${MAX_TOTAL_BYTES / 1024 / 1024} MB`);

	await mkdir(UPLOADS_DIR, { recursive: true });
	const saved: UploadedFile[] = [];
	for (const file of files) {
		const name = safeName(file.name);
		const stored = `${Date.now().toString(36)}-${randomUUID().slice(0, 8)}-${name}`;
		const target = path.join(UPLOADS_DIR, stored);
		try {
			await writeFile(target, Buffer.from(await file.arrayBuffer()));
		} catch {
			return refuse(500, `Could not store ${name}`);
		}
		saved.push({ name, path: target, size: file.size });
	}
	return Response.json({ files: saved }, { headers: HEADERS });
}
