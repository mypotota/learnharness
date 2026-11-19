/**
 * Plugin background workers.
 *
 * The service contract matches the desktop (`PluginWorkerService`): plugins
 * register named worker definitions, start tasks against them, subscribe to
 * progress, wait for results and cancel. Execution is delegated to an
 * injectable executor — phase 4 plugs the model-backed runner in; until then
 * tasks fail with an explicit message instead of hanging.
 */

const crypto = require("node:crypto");

const STATUS = new Set(["queued", "running", "succeeded", "failed", "cancelled", "interrupted"]);
const TERMINAL = new Set(["succeeded", "failed", "cancelled", "interrupted"]);
const ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/i;

function now() {
	return Date.now();
}

class WorkerService {
	constructor(options = {}) {
		this.definitions = new Map();
		this.tasks = new Map();
		this.listeners = new Map();
		this.executor = options.executor || null;
		this.log = options.log || (() => {});
	}

	setExecutor(executor) {
		this.executor = executor;
	}

	register(definition) {
		if (!definition || typeof definition.id !== "string" || !ID_PATTERN.test(definition.id)) {
			throw new Error("Worker definitions require a lowercase id");
		}
		if (this.definitions.has(definition.id)) throw new Error(`Duplicate worker definition: ${definition.id}`);
		this.definitions.set(definition.id, {
			...definition,
			instructions: typeof definition.instructions === "string" ? definition.instructions : "",
		});
		return () => {
			this.definitions.delete(definition.id);
			for (const task of this.tasks.values()) {
				if (task.definitionId === definition.id && !TERMINAL.has(task.status)) this.cancel(task.id);
			}
		};
	}

	start(definitionId, input) {
		const definition = this.definitions.get(definitionId);
		if (!definition) throw new Error(`Unknown worker definition: ${definitionId}`);
		const task = {
			id: crypto.randomUUID(),
			definitionId,
			requestId: input && typeof input.requestId === "string" ? input.requestId : undefined,
			input,
			status: "queued",
			turns: 0,
			activity: "",
			usage: undefined,
			result: undefined,
			error: undefined,
			createdAt: now(),
			updatedAt: now(),
			controller: new AbortController(),
			waiters: [],
		};
		this.tasks.set(task.id, task);
		this.notify(task);
		void this.run(task, definition);
		return this.publicTask(task);
	}

	async run(task, definition) {
		task.status = "running";
		task.startedAt = now();
		this.notify(task);
		try {
			if (!this.executor) throw new Error("Background jobs are not available in this build yet");
			const result = await this.executor({ task, definition, signal: task.controller.signal });
			if (task.controller.signal.aborted) return;
			if (typeof definition.validateResult === "function") definition.validateResult(result);
			task.result = result;
			task.status = "succeeded";
		} catch (error) {
			if (task.controller.signal.aborted) {
				task.status = "cancelled";
			} else {
				task.status = "failed";
				task.error = error instanceof Error ? error.message : String(error);
				this.log(`worker ${task.id} failed:`, task.error);
			}
		} finally {
			task.finishedAt = now();
			task.updatedAt = now();
			if (!TERMINAL.has(task.status)) task.status = "failed";
			this.settle(task);
			this.notify(task);
		}
	}

	cancel(id) {
		const task = this.require(id);
		if (TERMINAL.has(task.status)) return this.publicTask(task);
		task.controller.abort();
		task.status = "cancelled";
		task.updatedAt = now();
		task.finishedAt = now();
		this.settle(task);
		this.notify(task);
		return this.publicTask(task);
	}

	list() {
		return [...this.tasks.values()].sort((a, b) => a.createdAt - b.createdAt).map((task) => this.publicTask(task));
	}

	get(id) {
		return this.publicTask(this.require(id));
	}

	wait(id, signal) {
		const task = this.require(id);
		if (TERMINAL.has(task.status)) return Promise.resolve(this.publicTask(task));
		return new Promise((resolve, reject) => {
			const waiter = {
				resolve: (value) => {
					cleanup();
					resolve(value);
				},
				reject,
			};
			const abort = () => {
				cleanup();
				reject(Object.assign(new Error("Worker wait aborted"), { name: "AbortError" }));
			};
			const cleanup = () => {
				task.waiters = task.waiters.filter((item) => item !== waiter);
				if (signal) signal.removeEventListener("abort", abort);
			};
			task.waiters.push(waiter);
			if (signal) {
				if (signal.aborted) abort();
				else signal.addEventListener("abort", abort, { once: true });
			}
		});
	}

	subscribe(id, listener) {
		const task = this.require(id);
		if (typeof listener !== "function") throw new Error("Worker subscribe requires a callback");
		const set = this.listeners.get(id) || new Set();
		set.add(listener);
		this.listeners.set(id, set);
		listener(this.publicTask(task));
		return () => {
			set.delete(listener);
			if (!set.size) this.listeners.delete(id);
		};
	}

	dispose() {
		for (const task of this.tasks.values()) {
			if (!TERMINAL.has(task.status)) task.controller.abort();
			const set = this.listeners.get(task.id);
			if (set) for (const listener of set) {
				try {
					listener(this.publicTask(task));
				} catch {}
			}
		}
		this.listeners.clear();
		this.definitions.clear();
		this.tasks.clear();
	}

	require(id) {
		const task = this.tasks.get(id);
		if (!task) throw new Error(`Unknown worker task: ${id}`);
		return task;
	}

	settle(task) {
		const waiters = task.waiters.splice(0);
		for (const waiter of waiters) waiter.resolve(this.publicTask(task));
	}

	notify(task) {
		task.updatedAt = now();
		const set = this.listeners.get(task.id);
		if (!set) return;
		for (const listener of set) {
			try {
				listener(this.publicTask(task));
			} catch (error) {
				this.log(`worker listener failed: ${error instanceof Error ? error.message : String(error)}`);
			}
		}
	}

	publicTask(task) {
		return {
			id: task.id,
			definitionId: task.definitionId,
			...(task.requestId ? { requestId: task.requestId } : {}),
			status: STATUS.has(task.status) ? task.status : "failed",
			turns: task.turns,
			activity: task.activity,
			...(task.usage ? { usage: task.usage } : {}),
			...(task.result !== undefined ? { result: task.result } : {}),
			...(task.error ? { error: task.error } : {}),
			createdAt: task.createdAt,
			updatedAt: task.updatedAt,
			...(task.startedAt ? { startedAt: task.startedAt } : {}),
			...(task.finishedAt ? { finishedAt: task.finishedAt } : {}),
		};
	}
}

module.exports = { WorkerService };
