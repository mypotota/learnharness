import { builtinProviders } from "@earendil-works/pi-ai/providers/all";
import { createModels, getSupportedThinkingLevels } from "@earendil-works/pi-ai";

const models = createModels({
	authContext: {
		env: async (name: string) => (name === "DEEPSEEK_API_KEY" ? "test" : undefined),
		fileExists: async () => false,
	},
});
for (const provider of builtinProviders()) models.setProvider(provider);
console.log(models.getProviders().length, getSupportedThinkingLevels, models.getModels("deepseek"));
