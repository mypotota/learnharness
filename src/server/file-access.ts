/** Current optional learner-source preferences, wired by the server
 * composition root into the #157 policy seam. Mandatory #421 protection
 * stays in fs-shared; do NOT add a whole data/userData denial here. */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { FileAccessPolicy } from "../agent/tools/file-access.ts";
import { readFileAccessSettings } from "../store/settings.ts";
import { PATHS } from "../../config.ts";

/** Files uploaded through the browser/mobile composer live here; the agent
 *  must always be able to read what the learner just attached, even under a
 *  restricted policy. Created on first upload, so restrict to presence. */
const UPLOADS_DIR = path.join(PATHS.data, "uploads");

export function expandFolder(folder: string, home: string = os.homedir()): string {
	if (folder === "~") return home;
	if (folder.startsWith("~/")) return path.join(home, folder.slice(2));
	if (!path.isAbsolute(folder)) throw new Error("Invalid file-access folder for this server filesystem");
	return path.resolve(folder);
}

export function fileAccessPolicy(): FileAccessPolicy {
	const result = readFileAccessSettings();
	if (!result.ok) return { restricted: true, folders: [], error: result.error };
	const folders = result.settings.folders.map((folder) => expandFolder(folder));
	if (result.settings.restricted && fs.existsSync(UPLOADS_DIR)) folders.push(UPLOADS_DIR);
	return { restricted: result.settings.restricted, folders };
}

/** Safe UI diagnostic, no raw JSON/file contents. A corrupt record must
 * not make the restriction toggle appear safely OFF while reads are blocked. */
export function fileAccessConfigurationError(): string | null {
	const result = readFileAccessSettings();
	return result.ok ? null : result.error;
}
