import { defineConfig, globalIgnores } from "eslint/config";
import nextPlugin from "@next/eslint-plugin-next";
import tsParser from "@typescript-eslint/parser";
import importPlugin from "eslint-plugin-import";

/**
 * ESLint with one job here: ENFORCE THE IMPORT LAW (the shell/core
 * architecture, docs/architecture.md). Everything else stays out of the
 * way — this is not a style linter.
 *
 *   components/**  →  "@/src/core"  (the pure core barrel) — ONLY
 *   app/**         →  "@/src/core" + "@/src/server" (the server barrel) — ONLY
 *   src/core/**    →  never imports src/agent, src/server, src/store (pure
 *                    core: adapters implement core/ports.ts, never the reverse)
 *   src/agent/**   →  never imports src/server, src/store (dependencies —
 *                    the storage ports, the composition — arrive via
 *                    factories/closures from the chat-handler)
 *
 * tests/ and scripts/ are internal — unrestricted.
 */

export default defineConfig([
	// electron/** — the desktop shell: plain Node, no framework, outside the
// import law (same rationale as scripts/).
	globalIgnores([".next/**", "node_modules/**", "data/**", "next-env.d.ts", "scripts/**", "electron/**", "dist/**", "mobile/.cache/**", "mobile/android/app/build/**", "mobile/node-runtime/**", "mobile/dist/**"]),
	{
		files: ["**/*.{js,mjs,ts,tsx}"],
		languageOptions: {
			parser: tsParser,
			parserOptions: { ecmaVersion: "latest", sourceType: "module" },
		},
		plugins: { "@next/next": nextPlugin, import: importPlugin },
		settings: {
			"import/resolver": { typescript: { alwaysTryTypes: true } },
		},
		rules: {
			...nextPlugin.configs.recommended.rules,
			// The i18n wave (2026-11-19) keeps the ROUTES locale-free: no
			// [locale] segment, no middleware rewrite. next-intl's
			// request-scoped APIs need exactly that machinery, so they are
			// banned outright — a translator is built from the static catalogs
			// in src/core/i18n instead.
			"no-restricted-imports": [
				"error",
				{
					paths: [
						{ name: "next-intl/server", message: "No request-scoped next-intl: this wave keeps the routes locale-free. Use the static catalogs in \"@/src/core/i18n\"." },
						{ name: "next-intl/middleware", message: "No middleware locale rewrite in this wave — the URL is the same in every language." },
						{ name: "next-intl/navigation", message: "No locale-prefixed navigation in this wave — the URL is the same in every language." },
						{ name: "next-intl/routing", message: "No locale routing in this wave — the URL is the same in every language." },
					],
				},
			],
			"import/no-restricted-paths": [
				"error",
				{
					zones: [
						{
							target: "./components",
							from: "./src",
							// NOTE: the plugin resolves `except` relative to the zone's `from` path.
							// ./core/i18n is the i18n DATA layer (i18n wave, 2026-11-19): the
							// locale vocabulary and the message catalogs — pure data, no IO, no
							// node builtins. The shell needs the catalogs to render; the
							// barrel stays free of them so a plain import does not drag the
							// whole dictionary into every chunk.
							except: ["./core/index.ts", "./core/i18n"],
							message:
								"Browser shell imports ONLY the pure core barrel: `from \"@/src/core\"` (architecture: docs/architecture.md).",
						},
						{
							target: "./app",
							from: "./src",
							except: ["./core/index.ts", "./server/index.ts"],
							message:
								"app/ (transport + server components) imports ONLY the barrels: `@/src/core` and `@/src/server` (architecture: docs/architecture.md).",
						},
						{
							target: "./src/core",
							from: ["./src/agent", "./src/server", "./src/store"],
							message:
								"Pure core never imports IO layers (agent/server/store): adapters implement core/ports.ts, and the composition root (src/server/stores.ts) passes them in (architecture: docs/architecture.md).",
						},
						{
							target: "./src/agent",
							from: ["./src/server", "./src/store"],
							message:
								"The agent layer receives its dependencies (storage ports via factories/closures) — it never imports the server layer or store adapters (architecture: docs/architecture.md).",
						},
					],
				},
			],
		},
	},
	{
		// The shell never imports next-intl itself: every surface reads words
		// through `useT()` (components/i18n/i18n-provider.tsx). A direct
		// import would break the English fallback that surfaces without a
		// provider rely on. src/server/error-response.ts is the one sanctioned
		// exception — the API's English voice, built from the same static
		// catalogs (see that file; the request-scoped APIs stay banned).
		files: ["**/*.{ts,tsx}"],
		ignores: ["components/i18n/**", "src/server/error-response.ts", "scripts/**", "tests/**"],
		rules: {
			"no-restricted-imports": [
				"error",
				{
					paths: [
						{ name: "next-intl", message: "Read words through `useT()` (components/i18n/i18n-provider.tsx) — direct next-intl imports live there only." },
						{ name: "next-intl/server", message: "No request-scoped next-intl: this wave keeps the routes locale-free." },
						{ name: "next-intl/middleware", message: "No middleware locale rewrite in this wave — the URL is the same in every language." },
						{ name: "next-intl/navigation", message: "No locale-prefixed navigation in this wave — the URL is the same in every language." },
						{ name: "next-intl/routing", message: "No locale routing in this wave — the URL is the same in every language." },
					],
				},
			],
		},
	},
]);
