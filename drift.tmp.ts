import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import ts from "typescript";
import { EN_MESSAGES } from "/Users/zhao/Desktop/project/learnharness/src/core/i18n/messages/index.ts";

const TEXT_PROPS = new Set([
	"label", "title", "placeholder", "aria-label", "alt", "description", "hint",
	"emptyText", "text", "message", "confirmLabel", "cancelLabel", "errorText",
	"badgeText", "buttonText", "actionText", "shortcut", "empty", "caption",
	"subtitle", "heading", "summary", "placeholderText", "triggerLabel",
]);
function flatten(value: unknown, prefix = ""): Record<string, string> {
	const out: Record<string, string> = {};
	if (typeof value === "string") { out[prefix] = value; return out; }
	if (value && typeof value === "object") {
		for (const [key, child] of Object.entries(value as Record<string, unknown>)) Object.assign(out, flatten(child, prefix ? `${prefix}.${key}` : key));
	}
	return out;
}
const en = flatten(EN_MESSAGES);
const values = Object.values(en).map(v => v.replace(/\s+/g," ").trim());
const files = execSync("git diff --name-only HEAD -- components/settings components/i18n", {cwd:"/Users/zhao/Desktop/project/learnharness"}).toString().trim().split("\n").filter(f=>f.endsWith(".tsx")||f.endsWith(".ts"));

for (const file of files) {
	let text: string;
	try { text = execSync(`git show HEAD:${file}`, {cwd:"/Users/zhao/Desktop/project/learnharness"}).toString(); } catch { continue; }
	const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith(".tsx")?ts.ScriptKind.TSX:ts.ScriptKind.TS);
	const found = new Set<string>();
	const visit = (node: ts.Node) => {
		if (ts.isJsxText(node)) { const raw = node.text.trim().replace(/\s+/g," "); if (raw && /[A-Za-z]/.test(raw)) found.add(raw); }
		if (ts.isJsxAttribute(node) && node.name && TEXT_PROPS.has(node.name.getText(source)) && node.initializer) {
			const v = node.initializer;
			if (ts.isStringLiteral(v) || ts.isNoSubstitutionTemplateLiteral(v)) { const raw = v.text.trim().replace(/\s+/g," "); if (raw && /[A-Za-z]/.test(raw)) found.add(raw); }
		}
		if (ts.isPropertyAssignment(node)) {
			const name = node.name.getText(source).replace(/^["']|["']$/g, "");
			if (TEXT_PROPS.has(name)) { const v = node.initializer;
				if (ts.isStringLiteral(v) || ts.isNoSubstitutionTemplateLiteral(v)) { const raw = v.text.trim().replace(/\s+/g," "); if (raw && /[A-Za-z]/.test(raw)) found.add(raw); } }
		}
		ts.forEachChild(node, visit);
	};
	visit(source);
	const missing = [...found].filter(raw => !values.some(v => v.includes(raw) || raw.includes(v)));
	if (missing.length) { console.log("### " + file); for (const m of missing) console.log("   " + JSON.stringify(m)); }
}
