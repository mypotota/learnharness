/**
 * THE AUTH AREA (i18n wave, 2026-11-19): the curated auth-key catalog's
 * descriptions and the provider labels that carry English words. The
 * AUTH_PROVIDER_KEYS labels stay pi-ai's own names byte-for-byte (the
 * exact-equality gate in tests/auth-provider-keys.test.ts), so translation
 * happens at display time via providerLabel() — the catalog holds the
 * English originals for those, plus the tool-key descriptions.
 *
 * The English text IS today's wording, exactly.
 */

export const auth = {
	keyDeepgram: "Speech-to-text key for dictation — needs ≥ Member permission in the Deepgram console to mint tokens.",
	keyTavily: "Web-search engine for the researcher sub-agent (AI-native search API). Setting the key activates it — no engine toggle needed.",
	keyBrave: "Web-search engine for the researcher sub-agent — the alternative to Tavily. Setting the key activates it.",
	keyExa: "Web-search engine for the researcher. Search requests use your Exa account and its pricing.",
	keyFirecrawl: "Web-search engine for the researcher sub-agent — an alternative to Tavily and Brave. Setting the key activates it.",
	keyOllama: "Hosted web search at ollama.com — requires an Ollama API key. Setting it activates search, not local models.",
	qwenTokenPlan: "Qwen Token Plan",
	qwenTokenPlanCn: "Qwen Token Plan CN",
	qwenTokenPlanIndividual: "Qwen Token Plan Individual",
	xiaomiTokenPlanAms: "Xiaomi Token Plan AMS",
	xiaomiTokenPlanCn: "Xiaomi Token Plan CN",
	xiaomiTokenPlanSgp: "Xiaomi Token Plan SGP",
	zaiCodingCn: "Z.AI Coding CN",
	customEndpoint: "Custom endpoint",
} as const;
