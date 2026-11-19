/**
 * The plugin host.
 *
 * Mirrors the desktop host's externally visible behaviour for the parts the
 * built-in plugins actually use: manifest validation, enable/disable state,
 * backend activation, instruction/tool/question/problem registrations, the
 * frontend `call` bridge, and read-only learning data.
 *
 * The host itself is a plain CommonJS module with no dependencies so it can
 * run unchanged inside the embedded Node runtime.
 */

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { parseManifest, PLUGIN_ID_PATTERN } = require("./manifest");
const { WorkerService } = require("./workers");

const AGENT_KINDS = ["prober", "teacher", "practice"];
const OPERATION_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/i;
const TOOL_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_-]{0,63}$/;
const SAFE_SEGMENT = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;
const TURN_TTL_MS = 30 * 60 * 1000;
const MAX_TURNS = 20;

function errorText(error) {
	return error instanceof Error ? error.message : String(error);
}

function targets(agents) {
	if (!Array.isArray(agents) || !agents.length || !agents.every((agent) => AGENT_KINDS.includes(agent))) {
		throw new Error("Plugin contributions require explicit nonempty prober/teacher/practice targets");
	}
	return new Set(agents);
}

function regularFile(root, relative) {
	const segments = relative.split("/");
	if (!segments.every((segment) => SAFE_SEGMENT.test(segment))) throw new Error("Invalid plugin file path");
	let current = root;
	for (let i = 0; i < segments.length; i++) {
		current = path.join(current, segments[i]);
		const stat = fs.lstatSync(current);
		if (stat.isSymbolicLink()) throw new Error("Symlinks are not plugin assets");
		if (i === segments.length - 1 ? !stat.isFile() : !stat.isDirectory()) throw new Error("Invalid plugin file path");
	}
	return current;
}

class PluginHost {
	constructor(options) {
		this.coreDir = options.coreDir;
		this.communityDir = options.communityDir;
		this.installedDir = options.installedDir;
		this.dataDir = options.dataDir;
		this.learningDir = options.learningDir;
		this.appVersion = options.appVersion;
		this.reservedToolNames = new Set(options.reservedToolNames || []);
		this.stateFile = path.join(this.dataDir, "plugins-state.json");
		this.packages = new Map();
		this.learning = new Map();
		this.turns = new Map();
		this.warnings = [];
		this.serial = Promise.resolve();
		this.workers = new WorkerService({ log: (...parts) => console.log("[workers]", ...parts) });
	}

	enqueue(work) {
		const result = this.serial.then(work);
		this.serial = result.catch(() => {});
		return result;
	}

	state() {
		try {
			const value = JSON.parse(fs.readFileSync(this.stateFile, "utf8"));
			if (!value || value.version !== 1 || typeof value.enabled !== "object") return { version: 1, enabled: {} };
			return { version: 1, enabled: value.enabled };
		} catch (error) {
			if (error.code === "ENOENT") return { version: 1, enabled: {} };
			throw error;
		}
	}

	writeState(state) {
		fs.mkdirSync(this.dataDir, { recursive: true });
		const temp = `${this.stateFile}.${crypto.randomUUID()}.tmp`;
		fs.writeFileSync(temp, JSON.stringify(state));
		fs.renameSync(temp, this.stateFile);
	}

	/** Scan both package roots and cache manifests; never executes code. */
	async discover() {
		const state = this.state();
		const found = new Map();
		const readRoot = (root, origin, nested) => {
			if (!root || !fs.existsSync(root)) return;
			for (const id of fs.readdirSync(root).sort()) {
				if (!PLUGIN_ID_PATTERN.test(id)) continue;
				const base = path.join(root, id);
				const directory = nested ? path.join(base, "dist") : base;
				if (!fs.existsSync(path.join(directory, "manifest.json"))) continue;
				if (found.has(id) && found.get(id).origin === "core") continue;
				try {
					const manifestBytes = fs.readFileSync(path.join(directory, "manifest.json"));
					const manifest = parseManifest(JSON.parse(manifestBytes.toString("utf8")), id, this.appVersion);
					const hash = crypto.createHash("sha256").update(manifestBytes);
					for (const entry of [manifest.main, manifest.backend, manifest.styles]) {
						if (!entry) continue;
						const file = regularFile(directory, entry);
						hash.update(entry);
						hash.update(fs.readFileSync(file));
					}
					found.set(id, {
						id,
						origin,
						directory,
						manifest,
						revision: hash.digest("hex"),
						enabled: state.enabled[id] === true,
						status: "disabled",
						activation: undefined,
					});
				} catch (error) {
					found.set(id, {
						id,
						origin,
						directory,
						manifest: undefined,
						revision: "",
						enabled: false,
						status: "error",
						error: errorText(error),
						activation: undefined,
					});
				}
			}
		};
		readRoot(this.coreDir, "core", false);
		readRoot(this.communityDir, "community", true);
		readRoot(this.installedDir, "community", true);
		// A fresh scan restarts activations: packages are trusted local code and
		// an in-place update cannot be hot-swapped safely.
		for (const pkg of this.packages.values()) await this.deactivate(pkg);
		this.packages = found;
	}

	async init() {
		fs.mkdirSync(this.dataDir, { recursive: true });
		fs.mkdirSync(this.installedDir, { recursive: true });
		await this.discover();
		for (const pkg of this.packages.values()) {
			if (pkg.enabled && pkg.manifest) await this.activate(pkg);
		}
	}

	info(pkg) {
		return {
			id: pkg.id,
			origin: pkg.origin,
			manifest: pkg.manifest,
			enabled: pkg.enabled,
			status: pkg.status,
			...(pkg.error ? { error: pkg.error } : {}),
			revision: pkg.revision,
		};
	}

	list() {
		return [...this.packages.values()].sort((a, b) => a.id.localeCompare(b.id)).map((pkg) => this.info(pkg));
	}

	async setEnabled(id, enabled) {
		return this.enqueue(async () => {
			const pkg = this.packages.get(id);
			if (!pkg) throw new Error(`Unknown plugin: ${id}`);
			if (!pkg.manifest) throw new Error(pkg.error || "Plugin is invalid");
			if (pkg.enabled === enabled) return this.info(pkg);
			pkg.enabled = enabled;
			const state = this.state();
			state.enabled[id] = enabled;
			this.writeState(state);
			if (enabled) await this.activate(pkg);
			else await this.deactivate(pkg);
			return this.info(pkg);
		});
	}

	async refresh() {
		return this.enqueue(async () => {
			await this.discover();
			for (const pkg of this.packages.values()) {
				if (pkg.enabled && pkg.manifest) await this.activate(pkg);
			}
			return this.list();
		});
	}

	async activate(pkg) {
		if (!pkg.manifest?.backend) {
			pkg.status = "active";
			return;
		}
		const activation = {
			controller: new AbortController(),
			ready: false,
			cleanups: [],
			handlers: new Map(),
			instructions: [],
			tools: [],
			questions: new Map(),
			problems: new Map(),
		};
		pkg.activation = activation;
		pkg.status = "disabled";
		delete pkg.error;
		try {
			const entry = regularFile(pkg.directory, pkg.manifest.backend);
			const module = require(entry);
			if (!module || typeof module.activate !== "function") throw new Error("Plugin backend must export activate(context)");
			const context = this.context(pkg, activation);
			const cleanup = await module.activate(context);
			if (typeof cleanup === "function") activation.cleanups.push(cleanup);
			activation.ready = true;
			pkg.status = "active";
		} catch (error) {
			const failures = await this.deactivate(pkg);
			pkg.status = "error";
			pkg.error = [errorText(error), ...failures.map((failure) => `Cleanup: ${failure}`)].join("; ");
		}
	}

	async deactivate(pkg) {
		const activation = pkg.activation;
		if (!activation) return [];
		pkg.activation = undefined;
		activation.ready = false;
		activation.handlers.clear();
		activation.instructions.length = 0;
		activation.tools.length = 0;
		activation.questions.clear();
		activation.problems.clear();
		activation.controller.abort();
		const failures = [];
		for (const cleanup of activation.cleanups.splice(0).reverse()) {
			try {
				await cleanup();
			} catch (error) {
				failures.push(errorText(error));
			}
		}
		pkg.status = "disabled";
		return failures;
	}

	active() {
		return [...this.packages.values()].filter(
			(pkg) => pkg.enabled && pkg.status === "active" && pkg.activation?.ready && !pkg.activation.controller.signal.aborted,
		);
	}

	context(pkg, activation) {
		const signal = activation.controller.signal;
		const live = () => !signal.aborted && pkg.activation === activation;
		const assertLive = () => {
			if (!live()) throw new Error(`Plugin ${pkg.id} is disabled or unavailable`);
		};
		const register = (list, entry) => {
			assertLive();
			list.push(entry);
			return () => {
				const index = list.indexOf(entry);
				if (index >= 0) list.splice(index, 1);
			};
		};
		const registerMap = (map, key, entry) => {
			assertLive();
			if (map.has(key)) throw new Error(`Duplicate registration: ${key}`);
			map.set(key, entry);
			return () => map.delete(key);
		};
		const unavailable = (feature) => {
			const fail = () => {
				throw new Error(`${feature} is not available in this build`);
			};
			return new Proxy({}, { get: fail });
		};
		const learning = {
			directory: this.learningDir,
			listSessions: () =>
				[...this.learning.values()].map((record) => ({
					id: record.id,
					title: record.title,
					kind: record.kind,
					updatedAt: record.updatedAt ?? record.createdAt ?? 0,
					createdAt: record.createdAt ?? 0,
					messageCount: Array.isArray(record.messages) ? record.messages.length : 0,
				})),
			getSession: (id) => {
				if (typeof id !== "string" || !/^[A-Za-z0-9_-]+$/.test(id)) throw new Error("Invalid session id");
				return this.learning.get(id) ?? null;
			},
			graph: () => ({ version: 1, propositions: {}, chains: [], nodes: [], sessions: [], coverage: [], sources: [], positions: {} }),
			readGraphFile: () => {
				throw new Error("Graph files are not available on mobile");
			},
		};
		const inference = {
			catalog: async () => {
				throw new Error("Plugin model catalog is not available yet");
			},
			stream: () => {
				throw new Error("Plugin inference is not available yet");
			},
			complete: async () => {
				throw new Error("Plugin inference is not available yet");
			},
		};
		return {
			manifest: pkg.manifest,
			directory: pkg.directory,
			dataDirectory: path.join(this.dataDir, "plugin-data", pkg.id),
			signal,
			cleanup: (dispose) => {
				if (typeof dispose === "function") activation.cleanups.push(dispose);
			},
			learning,
			inference,
			agents: unavailable("Plugin agent conversations"),
			workers: this.workers,
			createBackgroundTool: () => {
				throw new Error("Plugin background tools are not available yet");
			},
			registerInstructions: (contribution) => {
				if (!contribution || typeof contribution.text !== "string" || !contribution.text.trim()) {
					throw new Error("Instruction contributions require nonempty text");
				}
				return register(activation.instructions, { agents: targets(contribution.agents), text: contribution.text });
			},
			registerTools: (contribution) => {
				if (!contribution || typeof contribution.create !== "function") throw new Error("Tool contributions require a create(context) factory");
				return register(activation.tools, { agents: targets(contribution.agents), create: contribution.create });
			},
			registerQuestionType: (definition) => {
				if (!definition || typeof definition.id !== "string" || !definition.id.trim()) throw new Error("Question types require an id");
				return registerMap(activation.questions, definition.id, definition);
			},
			registerProblemType: (definition) => {
				if (!definition || typeof definition.id !== "string" || !definition.id.trim()) throw new Error("Problem types require an id");
				return registerMap(activation.problems, definition.id, definition);
			},
			handle: (name, handler) => {
				if (typeof name !== "string" || !OPERATION_PATTERN.test(name)) throw new Error(`Invalid operation name: ${name}`);
				if (typeof handler !== "function") throw new Error("handle() requires a function");
				return registerMap(activation.handlers, name, handler);
			},
			events: {
				on: () => () => {},
				emit: () => {},
			},
		};
	}

	/** One per-turn snapshot: fresh tool instances plus prompt text. */
	snapshot(chatId, agent) {
		if (typeof chatId !== "string" || !chatId.trim()) throw new Error("Invalid plugin tool context: chatId");
		if (!AGENT_KINDS.includes(agent)) throw new Error("Invalid plugin tool context: agent");
		const turn = { chatId, agent };
		const turnId = crypto.randomUUID();
		const instructions = [];
		const tools = [];
		const warnings = [];
		const names = new Set(this.reservedToolNames);
		const toolMap = new Map();
		const questions = [];
		const problems = [];
		for (const pkg of this.active()) {
			const activation = pkg.activation;
			try {
				for (const item of activation.instructions) {
					if (item.agents.has(agent)) instructions.push(item.text);
				}
				const created = [];
				for (const factory of activation.tools) {
					if (!factory.agents.has(agent)) continue;
					const list = factory.create(turn);
					if (!Array.isArray(list)) {
						if (list && typeof list.then === "function") void Promise.resolve(list).catch(() => {});
						throw new Error("Plugin tool factory must synchronously return a tool array");
					}
					created.push(...list);
				}
				const packageNames = new Set();
				for (const tool of created) {
					if (!tool || typeof tool.name !== "string" || !TOOL_NAME_PATTERN.test(tool.name)) throw new Error("Invalid plugin tool name");
					if (names.has(tool.name) || packageNames.has(tool.name)) throw new Error(`Plugin tool name collision: ${tool.name}`);
					if (typeof tool.execute !== "function") throw new Error(`Invalid plugin tool: ${tool.name}`);
					packageNames.add(tool.name);
					toolMap.set(tool.name, tool);
					tools.push({
						name: tool.name,
						label: tool.label ?? tool.name,
						description: tool.description ?? "",
						parameters: tool.parameters,
						pluginId: pkg.id,
						executionMode: tool.executionMode === "sequential" ? "sequential" : "parallel",
					});
				}
				for (const definition of activation.questions.values()) {
					questions.push({
						pluginId: pkg.id,
						id: definition.id,
						label: definition.label,
						contractVersion: definition.contractVersion,
						showThinking: definition.showThinking === true,
						questionSchema: definition.questionSchema,
						answerSchema: definition.answerSchema,
						teach: definition.teach,
					});
				}
				for (const definition of activation.problems.values()) {
					problems.push({
						pluginId: pkg.id,
						id: definition.id,
						label: definition.label,
						contractVersion: definition.contractVersion,
						tool: definition.tool,
						problemSchema: definition.problemSchema,
						submissionSchema: definition.submissionSchema,
					});
				}
			} catch (error) {
				warnings.push(`${pkg.id}: ${errorText(error)}`);
			}
		}
		const controller = new AbortController();
		this.turns.set(turnId, { tools: toolMap, controller, created: Date.now() });
		this.evictTurns();
		return { turnId, instructions, tools, questions, problems, warnings };
	}

	evictTurns() {
		const now = Date.now();
		for (const [id, turn] of this.turns) {
			if (now - turn.created > TURN_TTL_MS) {
				turn.controller.abort();
				this.turns.delete(id);
			}
		}
		while (this.turns.size > MAX_TURNS) {
			const oldest = this.turns.keys().next().value;
			const turn = this.turns.get(oldest);
			turn.controller.abort();
			this.turns.delete(oldest);
		}
	}

	endTurn(turnId) {
		const turn = this.turns.get(turnId);
		if (!turn) return false;
		turn.controller.abort();
		this.turns.delete(turnId);
		return true;
	}

	async executeTool(turnId, name, toolCallId, input) {
		const turn = this.turns.get(turnId);
		if (!turn) throw new Error("Unknown tool turn; reload the chat and try again");
		const tool = turn.tools.get(name);
		if (!tool) throw new Error(`Unknown plugin tool: ${name}`);
		turn.controller.signal.throwIfAborted();
		const output = await tool.execute(toolCallId, input, turn.controller.signal, () => {});
		if (turn.controller.signal.aborted) throw new Error("Plugin tool turn was cancelled");
		return output;
	}

	async call(pluginId, operation, input) {
		const pkg = this.packages.get(pluginId);
		const activation = pkg?.activation;
		if (!pkg || !activation?.ready || !pkg.enabled) throw new Error(`Plugin ${pluginId} is disabled or unavailable`);
		const handler = activation.handlers.get(operation);
		if (!handler) throw new Error(`Unknown plugin operation: ${pluginId}/${operation}`);
		return handler(input);
	}

	async gradeQuestion(pluginId, typeId, request) {
		const pkg = this.packages.get(pluginId);
		const definition = pkg?.activation?.questions.get(typeId);
		if (!definition || typeof definition.gradeAnswer !== "function") throw new Error(`Plugin question grading is unavailable: ${pluginId}/${typeId}`);
		return definition.gradeAnswer(request);
	}

	async processProblem(pluginId, typeId, request) {
		const pkg = this.packages.get(pluginId);
		const definition = pkg?.activation?.problems.get(typeId);
		if (!definition || typeof definition.processSubmission !== "function") throw new Error(`Plugin problem processing is unavailable: ${pluginId}/${typeId}`);
		return definition.processSubmission(request);
	}

	syncLearning(records) {
		if (!Array.isArray(records)) throw new Error("Learning sync requires an array");
		for (const record of records) {
			if (record && typeof record.id === "string") this.learning.set(record.id, record);
		}
	}

	/** Read a packaged file for the frontend loader; path-validated. */
	readAsset(id, relative) {
		const pkg = this.packages.get(id);
		if (!pkg?.manifest) throw new Error(`Unknown plugin: ${id}`);
		return { file: regularFile(pkg.directory, relative), manifest: pkg.manifest, directory: pkg.directory };
	}
}

module.exports = { PluginHost, errorText };
