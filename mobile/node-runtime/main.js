/**
 * The embedded Node runtime.
 *
 * Android has no server process, so the app ships one: this script boots a
 * loopback HTTP server that hosts plugin backends and background jobs. The
 * WebView talks to it through the existing LocalProxy.
 */

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { PluginHost } = require("./plugins/host");

const dataDir = process.argv[2] || path.join(__dirname, "data");
fs.mkdirSync(dataDir, { recursive: true });

/** Plugin compatibility is measured against the desktop app version these
 *  packages were built for; the mobile shell releases in step with it. */
const APP_VERSION = "0.6.1";
const PORT_START = 47821;
const PORT_TRIES = 20;
const MAX_BODY = 20 * 1024 * 1024;
const startedAt = Date.now();

const logFile = path.join(dataDir, "node.log");
function log(...parts) {
	const line = `[${new Date().toISOString()}] ${parts.join(" ")}\n`;
	try {
		fs.appendFileSync(logFile, line);
	} catch {}
	console.log(line.trimEnd());
}

const MIME = {
	".js": "text/javascript; charset=utf-8",
	".mjs": "text/javascript; charset=utf-8",
	".css": "text/css; charset=utf-8",
	".json": "application/json; charset=utf-8",
	".svg": "image/svg+xml",
	".png": "image/png",
	".jpg": "image/jpeg",
	".jpeg": "image/jpeg",
	".gif": "image/gif",
	".webp": "image/webp",
	".woff": "font/woff",
	".woff2": "font/woff2",
	".ico": "image/x-icon",
	".txt": "text/plain; charset=utf-8",
	".wasm": "application/wasm",
};

const host = new PluginHost({
	coreDir: path.join(__dirname, "plugins", "core"),
	communityDir: path.join(__dirname, "plugins", "community"),
	installedDir: path.join(dataDir, "plugins"),
	dataDir,
	learningDir: path.join(dataDir, "learning"),
	appVersion: APP_VERSION,
	reservedToolNames: [
		"probe",
		"recall",
		"quiz",
		"explain",
		"ask_user_question",
		"probe_done",
		"plan_init",
		"send_to_user",
	],
});

let hostReady = null;
function ready() {
	hostReady ??= host.init().then(
		() => log("plugin host ready:", host.list().length, "packages"),
		(error) => {
			hostReady = null;
			throw error;
		},
	);
	return hostReady;
}

function headers(extra) {
	return {
		"access-control-allow-origin": "*",
		"access-control-allow-headers": "content-type,x-lh-proxy-token,authorization",
		"access-control-allow-methods": "GET,POST,OPTIONS",
		"cache-control": "no-store",
		...extra,
	};
}

function json(res, status, body) {
	res.writeHead(status, headers({ "content-type": "application/json; charset=utf-8" }));
	res.end(JSON.stringify(body));
}

function fail(res, error, status = 400) {
	json(res, status, { error: error instanceof Error ? error.message : String(error) });
}

function readBody(req) {
	return new Promise((resolve, reject) => {
		const chunks = [];
		let size = 0;
		req.on("data", (chunk) => {
			size += chunk.length;
			if (size > MAX_BODY) {
				reject(new Error("Request body is too large"));
				req.destroy();
				return;
			}
			chunks.push(chunk);
		});
		req.on("end", () => {
			if (!chunks.length) return resolve(undefined);
			try {
				resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
			} catch {
				reject(new Error("Request body must be JSON"));
			}
		});
		req.on("error", reject);
	});
}

function serveAsset(res, id, relative) {
	try {
		const asset = host.readAsset(id, relative);
		const extension = path.extname(asset.file).toLowerCase();
		res.writeHead(200, headers({ "content-type": MIME[extension] || "application/octet-stream" }));
		res.end(fs.readFileSync(asset.file));
	} catch (error) {
		fail(res, error, 404);
	}
}

async function route(req, res) {
	const url = new URL(req.url || "/", "http://127.0.0.1");
	const pathname = decodeURIComponent(url.pathname);
	if (req.method === "OPTIONS") {
		res.writeHead(204, headers());
		res.end();
		return;
	}
	if (pathname === "/health") {
		json(res, 200, {
			ok: true,
			pid: process.pid,
			node: process.version,
			uptimeMs: Date.now() - startedAt,
			dataDir,
			plugins: host.list().length,
		});
		return;
	}
	if (pathname.startsWith("/plugins/assets/")) {
		const rest = pathname.slice("/plugins/assets/".length).split("/");
		const id = rest.shift();
		serveAsset(res, id, rest.join("/"));
		return;
	}
	await ready();
	if (pathname === "/plugins" && req.method === "GET") {
		json(res, 200, { plugins: host.list() });
		return;
	}
	if (pathname === "/plugins/refresh" && req.method === "POST") {
		json(res, 200, { plugins: await host.refresh() });
		return;
	}
	if (pathname === "/plugins/enabled" && req.method === "POST") {
		const body = await readBody(req);
		if (!body || typeof body.id !== "string" || typeof body.enabled !== "boolean") throw new Error("Expected { id, enabled }");
		json(res, 200, { plugin: await host.setEnabled(body.id, body.enabled) });
		return;
	}
	if (pathname === "/plugins/loadout" && req.method === "POST") {
		const body = await readBody(req);
		json(res, 200, host.snapshot(body?.chatId, body?.agent));
		return;
	}
	if (pathname === "/plugins/turn/end" && req.method === "POST") {
		const body = await readBody(req);
		json(res, 200, { ended: host.endTurn(body?.turnId) });
		return;
	}
	if (pathname === "/plugins/tool" && req.method === "POST") {
		const body = await readBody(req);
		const output = await host.executeTool(body?.turnId, body?.name, body?.toolCallId, body?.input);
		json(res, 200, { output });
		return;
	}
	if (pathname === "/plugins/call" && req.method === "POST") {
		const body = await readBody(req);
		json(res, 200, { result: await host.call(body?.pluginId, body?.operation, body?.input) });
		return;
	}
	if (pathname === "/plugins/question/grade" && req.method === "POST") {
		const body = await readBody(req);
		json(res, 200, { result: await host.gradeQuestion(body?.pluginId, body?.typeId, body) });
		return;
	}
	if (pathname === "/plugins/problem/process" && req.method === "POST") {
		const body = await readBody(req);
		json(res, 200, { result: await host.processProblem(body?.pluginId, body?.typeId, body) });
		return;
	}
	if (pathname === "/plugins/learning/sync" && req.method === "POST") {
		const body = await readBody(req);
		host.syncLearning(body?.records);
		json(res, 200, { synced: Array.isArray(body?.records) ? body.records.length : 0 });
		return;
	}
	json(res, 404, { error: "not found" });
}

const server = http.createServer((req, res) => {
	route(req, res).catch((error) => {
		log("request failed", req.method, req.url, error.stack || error.message);
		if (!res.headersSent) fail(res, error, 500);
		else res.end();
	});
});

let port = PORT_START;
function listen() {
	server.once("error", (error) => {
		if (error.code === "EADDRINUSE" && port < PORT_START + PORT_TRIES) {
			port += 1;
			listen();
			return;
		}
		log("listen failed", error.stack || error.message);
		process.exit(1);
	});
	server.listen(port, "127.0.0.1", () => {
		const readyInfo = { port, pid: process.pid, node: process.version, dataDir, startedAt };
		fs.writeFileSync(path.join(dataDir, "node-ready.json"), JSON.stringify(readyInfo, null, 2));
		log("listening on 127.0.0.1:" + port, "node", process.version);
		void ready().catch((error) => log("plugin host init failed", error.stack || error.message));
	});
}

process.on("uncaughtException", (error) => log("uncaught", error.stack || String(error)));
process.on("unhandledRejection", (error) => log("unhandled", error && error.stack ? error.stack : String(error)));

listen();
