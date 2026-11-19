#!/usr/bin/env node
/**
 * P0 spike provider: an SSE endpoint the Android WebView can reach without
 * any real API key. It deliberately omits CORS headers by default so the
 * check reproduces the failure mode of provider APIs that do not grant
 * browser origins; set CORS=1 to isolate streaming from CORS.
 *
 *   node spike/mock-provider.mjs            # no CORS headers
 *   CORS=1 node spike/mock-provider.mjs     # permissive CORS
 */
import { createServer } from "node:http";

const PORT = Number(process.env.PORT ?? 8787);
const CORS = process.env.CORS === "1";

const server = createServer((request, response) => {
	if (request.url === "/health") {
		response.writeHead(200, { "content-type": "application/json" });
		response.end(JSON.stringify({ ok: true, cors: CORS }));
		return;
	}
	if (request.url !== "/stream") {
		response.writeHead(404).end();
		return;
	}
	const headers = {
		"content-type": "text/event-stream",
		"cache-control": "no-cache",
		connection: "keep-alive",
	};
	if (CORS) headers["access-control-allow-origin"] = "*";
	response.writeHead(200, headers);
	let index = 0;
	const words = ["流", "式", "验", "证", "：", "每", "个", "片", "段", "都", "应", "立", "即", "到", "达", "。"];
	const timer = setInterval(() => {
		if (index >= words.length) {
			response.write("data: [DONE]\n\n");
			response.end();
			clearInterval(timer);
			return;
		}
		response.write(`data: ${JSON.stringify({ delta: words[index++] })}\n\n`);
	}, 120);
	request.on("close", () => clearInterval(timer));
});

server.listen(PORT, "0.0.0.0", () => {
	console.log(`spike provider on http://0.0.0.0:${PORT}/stream (CORS=${CORS ? "on" : "off"})`);
	console.log("simulator: http://10.0.2.2:8787/stream · device: http://<your-lan-ip>:8787/stream");
});
