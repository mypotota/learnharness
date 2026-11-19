/**
 * THE SETUP AREA (i18n wave, 2026-11-19): the first-run setup dialog and
 * the home CTA that opens it. Slot labels, catalog-failure copy and the
 * aria shapes reuse the settings catalog (settings.agent.*, settings.keys.*).
 *
 * The English text IS today's wording, exactly.
 */

export const setup = {
	title: "Set up your models",
	intro: "Choose your AI provider and paste its API key. You’ll pick your models next.",
	pickersIntro: "Pick the model for each tier. All three are required before chats can start.",
	providerAria: "Provider",
	pickProvider: "Pick a provider…",
	saving: "Saving…",
	saveKey: "Save key",
	saveModels: "Save models",
	loadingModels: "Loading models…",
	ariaClose: "Close setup",
	needed: "needed",
	pickModel: "Pick a model…",
	saveFailedOffline: "Save failed. Check your connection and try again.",
	saveFailedLine: "Save failed: {error}",
	rosterStrong: "Prober, teacher",
	rosterCheap: "Researcher, demo builder, extractor, auditor",
	rosterVision: "Visual maker + PDF reader",
	noVisionModels: "No image-capable models. Add a provider key with access to a vision model.",
	addProviderCta: "Add a provider key",
} as const;
