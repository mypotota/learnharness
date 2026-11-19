#!/usr/bin/env node
/**
 * P2 verification endpoint: a tiny OpenAI-compatible provider with SSE
 * streaming and NO CORS headers. The app must reach it through the native
 * loopback proxy; a direct WebView fetch would be blocked.
 *
 *   node spike/mock-openai.mjs            # listens on 0.0.0.0:8788
 *   adb reverse tcp:8788 tcp:8788          # device loopback → this process
 *   base URL in the app: http://127.0.0.1:8788/v1
 */
import { createServer } from "node:http";

const PORT = Number(process.env.PORT ?? 8788);

const REPLY = [
	"**先不急着背结论。** 你说的“总是搞混”，通常是因为只记了公式，而没有看见图像。\n\n",
	"想一想 $y=x^2$：当 $x$ 越来越远离 $0$ 时，$y$ 会怎样变化？\n\n",
	"$$y = a(x-h)^2 + k$$\n\n",
	"如果 $a>0$，抛物线开口向上，顶点是**最小值**；如果 $a<0$，开口向下，顶点是**最大值**。\n\n",
	"你先回答我：$y=-(x-2)^2+5$ 的最大值是多少？在哪里取到？",
];

const server = createServer((request, response) => {
	console.log(`[mock] ${request.method} ${request.url}`);
	if (request.url === "/health") {
		response.writeHead(200, { "content-type": "application/json" });
		response.end(JSON.stringify({ ok: true }));
		return;
	}

	if (request.method === "GET" && request.url?.startsWith("/v1/models")) {
		response.writeHead(200, { "content-type": "application/json" });
		response.end(JSON.stringify({ object: "list", data: [{ id: "mock-teacher", object: "model" }] }));
		return;
	}

	if (request.method !== "POST" || !request.url?.startsWith("/v1/chat/completions")) {
		response.writeHead(404).end();
		return;
	}

	let body = "";
	request.on("data", (chunk) => (body += chunk));
	request.on("end", () => {
		let model = "mock-teacher";
		try {
			model = JSON.parse(body).model ?? model;
		} catch {
			/* keep the default id */
		}
		console.log(`[mock] chat request model=${model} auth=${request.headers.authorization ? "yes" : "no"}`);

		// Deliberately no access-control-allow-origin header.
		response.writeHead(200, {
			"content-type": "text/event-stream",
			"cache-control": "no-cache",
			connection: "keep-alive",
		});

		const chunks = REPLY;
		let index = 0;
		const timer = setInterval(() => {
			if (index >= chunks.length) {
				response.write("data: [DONE]\n\n");
				response.end();
				clearInterval(timer);
				return;
			}
			const payload = {
				id: "chatcmpl-mock",
				object: "chat.completion.chunk",
				created: Math.floor(Date.now() / 1000),
				model,
				choices: [{ index: 0, delta: { content: chunks[index++] }, finish_reason: null }],
			};
			response.write(`data: ${JSON.stringify(payload)}\n\n`);
		}, 180);
		request.on("close", () => clearInterval(timer));
	});
});

server.on("clientError", (error, socket) => {
	console.log(`[mock] clientError ${error.code ?? ""} ${error.message}`);
	if (socket.writable) socket.end("HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n");
});

server.listen(PORT, "0.0.0.0", () => {
	console.log(`mock OpenAI provider on http://0.0.0.0:${PORT}/v1 (no CORS headers)`);
});
