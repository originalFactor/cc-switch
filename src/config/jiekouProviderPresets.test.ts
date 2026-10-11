import { describe, expect, it } from "vitest";

import { claudeDesktopProviderPresets } from "./claudeDesktopProviderPresets";
import { providerPresets } from "./claudeProviderPresets";
import { codexProviderPresets } from "./codexProviderPresets";
import { getIcon, getIconMetadata } from "../icons/extracted";

const allJieKouPresetGroups = [
  ["Claude Code", providerPresets],
  ["Claude Desktop", claudeDesktopProviderPresets],
  ["Codex", codexProviderPresets],
] as const;

const defaultModelId = "claude-fable-5";
const defaultModelName = "Claude Fable 5";
const anthropicBaseUrl = "https://api.jiekou.ai/anthropic";
const openAiBaseUrl = "https://api.jiekou.ai/openai/v1";
const brandDetails = {
  websiteUrl: "https://jiekou.ai/#model-library",
  apiKeyUrl: "https://jiekou.ai/settings/key-management",
  category: "aggregator",
  icon: "jiekou",
  iconColor: "#000000",
};

function findJieKouEntry<T extends { name: string }>(entries: readonly T[]) {
  return entries.find((entry) => entry.name === "JieKou AI");
}

describe("JieKou AI provider presets", () => {
  it.each(allJieKouPresetGroups)(
    "%s registers exactly one JieKou AI preset",
    (_surface, entries) => {
      expect(
        entries.filter((entry) => entry.name === "JieKou AI"),
      ).toHaveLength(1);
    },
  );

  it("configures Claude Code with the Anthropic endpoint", () => {
    const preset = findJieKouEntry(providerPresets)!;
    expect(preset).toMatchObject({
      ...brandDetails,
      settingsConfig: {
        env: {
          ANTHROPIC_BASE_URL: anthropicBaseUrl,
          ANTHROPIC_AUTH_TOKEN: "",
          ANTHROPIC_MODEL: defaultModelId,
          ANTHROPIC_DEFAULT_HAIKU_MODEL: defaultModelId,
          ANTHROPIC_DEFAULT_SONNET_MODEL: defaultModelId,
          ANTHROPIC_DEFAULT_OPUS_MODEL: defaultModelId,
        },
      },
      endpointCandidates: [anthropicBaseUrl],
      modelsUrl: `${openAiBaseUrl}/models`,
    });
  });

  it("configures Claude Desktop with the Anthropic endpoint", () => {
    expect(findJieKouEntry(claudeDesktopProviderPresets)).toMatchObject({
      ...brandDetails,
      baseUrl: anthropicBaseUrl,
      mode: "proxy",
      apiFormat: "anthropic",
      modelRoutes: [
        {
          routeId: "claude-fable-5",
          upstreamModel: defaultModelId,
          supports1m: true,
        },
      ],
      endpointCandidates: [anthropicBaseUrl],
    });
  });

  it("configures Codex for the Chat Completions translation path", () => {
    const preset = findJieKouEntry(codexProviderPresets)!;
    expect(preset).toMatchObject({
      ...brandDetails,
      auth: { OPENAI_API_KEY: "" },
      endpointCandidates: [openAiBaseUrl],
      apiFormat: "openai_chat",
      modelCatalog: [
        {
          model: defaultModelId,
          displayName: defaultModelName,
          contextWindow: 1000000,
          inputModalities: ["text", "image"],
        },
      ],
    });
    expect(preset.config).toContain(`model = "${defaultModelId}"`);
    expect(preset.config).toContain(`base_url = "${openAiBaseUrl}"`);
    expect(preset.config).toContain('wire_api = "responses"');
    expect(`${openAiBaseUrl}/chat/completions`).toBe(
      "https://api.jiekou.ai/openai/v1/chat/completions",
    );
  });

  it("registers the JieKou AI brand icon", () => {
    expect(getIcon("jiekou")).toContain("<title>JieKou AI</title>");
    expect(getIconMetadata("jiekou")).toMatchObject({
      displayName: "JieKou AI",
      defaultColor: "#000000",
    });
  });
});
