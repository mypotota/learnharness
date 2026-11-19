/**
 * LH_RENDER_SERVICE_URL selects the phone's hidden-WebView render service for
 * runDemo (the Android port's puppeteer replacement). The service owns the
 * wire shape: a POSTed {html, settleMs, probe} must come back as a
 * DemoRunResult, and every transport failure must throw (the run_demo tool
 * surfaces the message as HEADLESS ERROR) instead of masquerading as a
 * clean page. The desktop helper/Chrome path is untouched when unset.
 */
import assert from "node:assert/strict";
import * as http from "node:http";
import { afterEach, describe, it } from "node:test";
import { realHeadless, renderServiceUrl } from "../src/agent/subagents/headless.ts";

const ENV_KEY = "LH_RENDER_SERVICE_URL";

type CapturedRequest = { url?: string; method?: string; contentType?: string; body?: string };

/** One-request fixture server: records the request, replies with `respond`. */
async function withFixture(
	respond: (req: CapturedRequest) => { status: number; body: string },
	run: (requests: CapturedRequest[], url: string) => Promise<void>,
): Promise<void> {
	const requests: CapturedRequest[] = [];
	const server = http.createServer((req, res) => {
		const captured: CapturedRequest = { url: req.url, method: req.method, contentType: req.headers["content-type"] };
		requests.push(captured);
		let body = "";
		req.on("data", (chunk: Buffer) => {
			body += chunk.toString("utf8");
		});
		req.on("end", () => {
			captured.body = body;
			const reply = respond(captured);
			res.writeHead(reply.status, { "content-type": "application/json" });
			res.end(reply.body);
		});
	});
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	const address = server.address();
	const url = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}/render`;
	try {
		await run(requests, url);
	} finally {
		server.close();
		server.closeAllConnections();
	}
}

describe("render service selection", () => {
	const saved = process.env[ENV_KEY];

	afterEach(() => {
		if (saved === undefined) delete process.env[ENV_KEY];
		else process.env[ENV_KEY] = saved;
	});

	it("reads the URL per call and trims it", () => {
		delete process.env[ENV_KEY];
		assert.equal(renderServiceUrl(), null);
		process.env[ENV_KEY] = "  http://127.0.0.1:41101/render  ";
		assert.equal(renderServiceUrl(), "http://127.0.0.1:41101/render");
	});

	it("reports available without the desktop reason when the service is set", () => {
		process.env[ENV_KEY] = "http://127.0.0.1:41101/render";
		assert.equal(realHeadless.available(), true);
		assert.equal(realHeadless.unavailableReason(), null);
	});

	it("keeps available() and unavailableReason() consistent when unset", () => {
		delete process.env[ENV_KEY];
		assert.equal(realHeadless.unavailableReason() === null, realHeadless.available());
	});
});

describe("runDemo over the render service", () => {
	const saved = process.env[ENV_KEY];

	afterEach(() => {
		if (saved === undefined) delete process.env[ENV_KEY];
		else process.env[ENV_KEY] = saved;
		delete process.env[ENV_KEY];
	});

	it("posts the demo payload and maps a clean result", async () => {
		await withFixture(
			() => ({ status: 200, body: JSON.stringify({ consoleErrors: [], pageErrors: [], failedRequests: [], ok: true }) }),
			async (requests, url) => {
				process.env[ENV_KEY] = url;
				const result = await realHeadless.runDemo("<p>hi</p>", { probe: "window.x", settleMs: 10 });
				assert.equal(result.ok, true);
				assert.equal(result.probeResult, undefined);
				assert.equal(requests.length, 1);
				const request = requests[0];
				assert.ok(request, "fixture captured no request");
				assert.equal(request.method, "POST");
				assert.match(request.contentType ?? "", /^application\/json/);
				assert.deepEqual(JSON.parse(request.body ?? "{}"), { html: "<p>hi</p>", settleMs: 10, probe: "window.x" });
			},
		);
	});

	it("omits unset optionals and passes probeResult through", async () => {
		await withFixture(
			() => ({ status: 200, body: JSON.stringify({ consoleErrors: [], pageErrors: [], failedRequests: [], probeResult: { n: 3 }, ok: true }) }),
			async (requests, url) => {
				process.env[ENV_KEY] = url;
				const result = await realHeadless.runDemo("<p>hi</p>");
				assert.deepEqual(result.probeResult, { n: 3 });
				const request = requests[0];
				assert.ok(request, "fixture captured no request");
				assert.equal(request.body, JSON.stringify({ html: "<p>hi</p>" }));
			},
		);
	});

	it("derives ok from the error arrays when the service omits it", async () => {
		await withFixture(
			() => ({ status: 200, body: JSON.stringify({ consoleErrors: ["boom"], pageErrors: [], failedRequests: ["http://cdn/x (failed)"] }) }),
			async (_requests, url) => {
				process.env[ENV_KEY] = url;
				const result = await realHeadless.runDemo("<p>hi</p>");
				assert.equal(result.ok, false);
				assert.deepEqual(result.consoleErrors, ["boom"]);
				assert.deepEqual(result.failedRequests, ["http://cdn/x (failed)"]);
			},
		);
	});

	it("throws on a non-200 status", async () => {
		await withFixture(
			() => ({ status: 503, body: JSON.stringify({ error: "renderer busy" }) }),
			async (_requests, url) => {
				process.env[ENV_KEY] = url;
				await assert.rejects(realHeadless.runDemo("<p>x</p>"), /HTTP 503/);
			},
		);
	});

	it("throws the service's own error field", async () => {
		await withFixture(
			() => ({ status: 200, body: JSON.stringify({ error: "renderer busy" }) }),
			async (_requests, url) => {
				process.env[ENV_KEY] = url;
				await assert.rejects(realHeadless.runDemo("<p>x</p>"), /render service: renderer busy/);
			},
		);
	});

	it("throws on an invalid JSON body", async () => {
		await withFixture(
			() => ({ status: 200, body: "<html>not json</html>" }),
			async (_requests, url) => {
				process.env[ENV_KEY] = url;
				await assert.rejects(realHeadless.runDemo("<p>x</p>"), /invalid JSON/);
			},
		);
	});

	it("throws when the service is unreachable", async () => {
		// Port 1 is not listening; the connect failure must surface as a throw.
		process.env[ENV_KEY] = "http://127.0.0.1:1/render";
		await assert.rejects(realHeadless.runDemo("<p>x</p>"), /render service unreachable/);
	});
});
