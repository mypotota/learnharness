/**
 * Plugin manifest parsing — the same rules the desktop applies
 * (`src/core/plugins.ts`), duplicated here because the Node runtime cannot
 * import TypeScript source at runtime.
 */

const PLUGIN_API_VERSION = 1;
const PLUGIN_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function versionParts(value, label) {
	if (typeof value !== "string" || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value)) {
		throw new Error(`${label} must have three numeric components (x.y.z)`);
	}
	return value.split(".").map(Number);
}

function parseManifest(value, folder, appVersion) {
	if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("manifest.json must be an object");
	const m = value;
	if (!PLUGIN_ID_PATTERN.test(folder) || m.id !== folder) throw new Error("Plugin id must match its lowercase-hyphen folder name");
	if (m.apiVersion !== PLUGIN_API_VERSION) throw new Error("Unsupported plugin apiVersion (expected 1)");
	for (const key of ["name", "version", "minAppVersion"]) {
		if (typeof m[key] !== "string" || !m[key].trim()) throw new Error(`Manifest ${key} is required`);
	}
	versionParts(m.version, "Manifest version");
	const required = versionParts(m.minAppVersion, "Manifest minAppVersion");
	const actual = versionParts(appVersion, "App version");
	for (let i = 0; i < 3; i++) {
		if (actual[i] > required[i]) break;
		if (actual[i] < required[i]) throw new Error(`Requires LearnHarness ${m.minAppVersion} or newer`);
	}
	for (const key of ["description", "author"]) {
		if (m[key] !== undefined && typeof m[key] !== "string") throw new Error(`Manifest ${key} must be a string`);
	}
	for (const [key, ext] of [["main", ".js"], ["backend", ".cjs"], ["styles", ".css"]]) {
		if (m[key] !== undefined && (typeof m[key] !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(m[key]) || !m[key].endsWith(ext))) {
			throw new Error(`Manifest ${key} must name a root ${ext} file`);
		}
	}
	if (!m.main && !m.backend) throw new Error("A plugin needs a main or backend entry");
	if (m.styles && !m.main) throw new Error("styles requires a frontend main entry");
	let translations;
	if (m.translations !== undefined) {
		if (!m.translations || typeof m.translations !== "object" || Array.isArray(m.translations)) throw new Error("Manifest translations must be an object keyed by locale");
		translations = {};
		for (const [locale, fields] of Object.entries(m.translations)) {
			if (locale !== "en" && locale !== "zh-CN") throw new Error(`Manifest translations key must be a shipped locale (en or zh-CN): ${locale}`);
			if (!fields || typeof fields !== "object" || Array.isArray(fields)) throw new Error(`Manifest translations.${locale} must be an object`);
			const entry = {};
			for (const field of ["name", "description"]) {
				if (fields[field] !== undefined && (typeof fields[field] !== "string" || !fields[field].trim())) {
					throw new Error(`Manifest translations.${locale}.${field} must be a nonempty string`);
				}
				if (fields[field] !== undefined) entry[field] = fields[field];
			}
			if (entry.name !== undefined || entry.description !== undefined) translations[locale] = entry;
		}
		if (!Object.keys(translations).length) translations = undefined;
	}
	return {
		apiVersion: 1,
		id: folder,
		name: m.name,
		version: m.version,
		minAppVersion: m.minAppVersion,
		...(m.description !== undefined ? { description: m.description } : {}),
		...(m.author !== undefined ? { author: m.author } : {}),
		...(translations ? { translations } : {}),
		...(m.main ? { main: m.main } : {}),
		...(m.backend ? { backend: m.backend } : {}),
		...(m.styles ? { styles: m.styles } : {}),
	};
}

module.exports = { PLUGIN_API_VERSION, PLUGIN_ID_PATTERN, parseManifest };
