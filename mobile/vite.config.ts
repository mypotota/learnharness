import { fileURLToPath } from "node:url";
import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The mobile app lives beside the desktop project and reuses its components,
// styles and src/core. Root-level node_modules is the single dependency tree:
// React is aliased there so the reused components and this entry share one copy.
const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");
const rootModules = path.join(repoRoot, "node_modules");

export default defineConfig({
	root: here,
	plugins: [react()],
	resolve: {
		alias: [
			{ find: "@", replacement: repoRoot },
			{ find: "react", replacement: path.join(rootModules, "react") },
			{ find: "react-dom", replacement: path.join(rootModules, "react-dom") },
			{ find: "next/link", replacement: path.join(here, "src/platform/next-link.tsx") },
			{ find: "next/navigation", replacement: path.join(here, "src/platform/next-navigation.ts") },
		],
		dedupe: ["react", "react-dom"],
	},
	publicDir: path.join(repoRoot, "public"),
	css: {
		// Reuse the desktop project's PostCSS config so Tailwind 4 keeps one
		// plugin/type instance (the mobile tree has its own postcss copy).
		postcss: path.join(repoRoot, "postcss.config.mjs"),
	},
	build: {
		outDir: path.join(here, "dist"),
		emptyOutDir: true,
	},
	server: {
		host: true,
		port: 5173,
	},
});
