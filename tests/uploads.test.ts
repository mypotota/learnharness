import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, test } from "node:test";

// Point the app's mutable data seam at a scratch dir BEFORE the module (and
// therefore config.ts) is loaded — the uploads root lives under it.
const DATA_DIR = mkdtempSync(path.join(tmpdir(), "lh-uploads-test-"));
process.env.LH_DATA_DIR = DATA_DIR;
const { uploadFilesResponse } = await import("../src/server/uploads.ts");

after(() => rmSync(DATA_DIR, { recursive: true, force: true }));

function uploadRequest(body: FormData | string, headers: Record<string, string> = {}) {
	return new Request("http://localhost:3000/api/uploads", {
		method: "POST",
		headers: { "x-learnharness-upload": "1", origin: "http://localhost:3000", ...headers },
		body,
	});
}

test("refuses requests without the same-origin upload intent", async () => {
	for (const headers of [
		{ origin: "https://attacker.invalid" },
		{ "sec-fetch-site": "cross-site" },
		{ "x-learnharness-upload": "" },
	] as Record<string, string>[]) {
		const response = await uploadFilesResponse(uploadRequest(new FormData(), headers));
		assert.equal(response.status, 403);
		assert.equal(response.headers.get("access-control-allow-origin"), null);
	}
});

test("stores the bytes and returns absolute paths under the data dir", async () => {
	const form = new FormData();
	form.append("files", new File(["hello notes"], "week 3.md", { type: "text/markdown" }));
	form.append("files", new File(["binary"], "../evil.png", { type: "image/png" }));
	const response = await uploadFilesResponse(uploadRequest(form));
	assert.equal(response.status, 200);
	const body = (await response.json()) as { files: { name: string; path: string; size: number }[] };
	assert.equal(body.files.length, 2);
	assert.deepEqual(body.files.map((file) => file.name), ["week 3.md", "evil.png"]);
	for (const file of body.files) {
		assert.equal(path.dirname(file.path), path.join(DATA_DIR, "uploads"));
		assert.ok(!file.path.includes(".."));
	}
	assert.equal(readFileSync(body.files[0]!.path, "utf8"), "hello notes");
	assert.equal(readFileSync(body.files[1]!.path, "utf8"), "binary");
});

test("rejects an upload with no files and an over-count upload", async () => {
	const empty = await uploadFilesResponse(uploadRequest(new FormData()));
	assert.equal(empty.status, 400);
	const many = new FormData();
	for (let i = 0; i < 11; i++) many.append("files", new File(["x"], `${i}.txt`));
	const tooMany = await uploadFilesResponse(uploadRequest(many));
	assert.equal(tooMany.status, 400);
});

test("rejects non-multipart bodies", async () => {
	const response = await uploadFilesResponse(uploadRequest("not a form"));
	assert.equal(response.status, 400);
});
