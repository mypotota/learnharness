/**
 * THE ENGLISH CATALOG (i18n wave, 2026-11-19): every area's English copy,
 * gathered in one place. The English text IS today's wording — the app's
 * English output must not change because of this wave.
 *
 * Each area is its own file so a wave touches exactly two files per area
 * (English + 简体中文) and the diff stays reviewable.
 */

import { common } from "./en/common.ts";
import { settings } from "./en/settings.ts";
import { sidebar } from "./en/sidebar.ts";
import { chat } from "./en/chat.ts";
import { composer } from "./en/composer.ts";
import { graph } from "./en/graph.ts";
import { chains } from "./en/chains.ts";
import { coverage } from "./en/coverage.ts";
import { question } from "./en/question.ts";
import { plan } from "./en/plan.ts";
import { practice } from "./en/practice.ts";
import { keyboard } from "./en/keyboard.ts";
import { auth } from "./en/auth.ts";
import { setup } from "./en/setup.ts";
import { sideThread } from "./en/side-thread.ts";
import { artifact } from "./en/artifact.ts";
import { find } from "./en/find.ts";
import { dialog } from "./en/dialog.ts";
import { stats } from "./en/stats.ts";
import { activity } from "./en/activity.ts";
import { overlay } from "./en/overlay.ts";
import { markdown } from "./en/markdown.ts";
import { shell } from "./en/shell.ts";
import { citation } from "./en/citation.ts";
import { plugins } from "./en/plugins.ts";
import { error } from "./en/error.ts";
import { syncStatus } from "./en/sync-status.ts";

export const EN_MESSAGES = {
	common,
	settings,
	sidebar,
	chat,
	composer,
	graph,
	chains,
	coverage,
	question,
	plan,
	practice,
	keyboard,
	auth,
	setup,
	sideThread,
	artifact,
	find,
	dialog,
	stats,
	activity,
	overlay,
	markdown,
	shell,
	citation,
	plugins,
	error,
	syncStatus,
} as const;

export type EnglishCatalog = typeof EN_MESSAGES;
