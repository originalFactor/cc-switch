import { describe, expect, it } from "vitest";

import { providerPresets } from "@/config/claudeProviderPresets";
import { codexProviderPresets } from "@/config/codexProviderPresets";
import { getIcon, hasIcon } from "@/icons/extracted";

const WEBSITE_URL = "https://moark.com";
const API_KEY_URL = "https://moark.com/dashboard/tokens";
const DEFAULT_MODEL = "deepseek-v4-flash-0731";

describe("MoArk (模力方舟) provider presets", () => {
  it("uses the Anthropic-native root endpoint for Claude Code", () => {
    const preset = providerPresets.find((item) => item.name === "模力方舟");

    expect(preset).toBeDefined();
    expect(preset?.websiteUrl).toBe(WEBSITE_URL);
    expect(preset?.apiKeyUrl).toBe(API_KEY_URL);
    expect(preset?.category).toBe("aggregator");
    expect(preset?.endpointCandidates).toEqual(["https://moark.com/anthropic"]);
    expect(preset?.icon).toBe("moark");

    const env = (preset?.settingsConfig as { env: Record<string, string> }).env;
    expect(env.ANTHROPIC_BASE_URL).toBe("https://moark.com/anthropic");
    expect(env.ANTHROPIC_AUTH_TOKEN).toBe("");
    expect(env.ANTHROPIC_MODEL).toBe(DEFAULT_MODEL);
    expect(env.ANTHROPIC_DEFAULT_HAIKU_MODEL).toBe(DEFAULT_MODEL);
    expect(env.ANTHROPIC_DEFAULT_SONNET_MODEL).toBe(DEFAULT_MODEL);
    expect(env.ANTHROPIC_DEFAULT_OPUS_MODEL).toBe(DEFAULT_MODEL);
  });

  it("uses the OpenAI-compatible Responses endpoint for Codex", () => {
    const preset = codexProviderPresets.find(
      (item) => item.name === "模力方舟",
    );

    expect(preset).toBeDefined();
    expect(preset?.websiteUrl).toBe(WEBSITE_URL);
    expect(preset?.apiKeyUrl).toBe(API_KEY_URL);
    expect(preset?.category).toBe("aggregator");
    expect(preset?.endpointCandidates).toEqual(["https://moark.com/v1"]);
    expect(preset?.icon).toBe("moark");
    expect(preset?.auth).toEqual({ OPENAI_API_KEY: "" });
    expect(preset?.config).toContain('model = "deepseek-v4-flash-0731"');
    expect(preset?.config).toContain('base_url = "https://moark.com/v1"');
    expect(preset?.config).toContain('wire_api = "responses"');
  });

  it("declares the Codex model catalog so /model lists every MoArk model", () => {
    const preset = codexProviderPresets.find(
      (item) => item.name === "模力方舟",
    );
    const catalog = preset?.modelCatalog ?? [];

    // 缺 modelCatalog 时 Codex 退回通用元数据，/model 只会列出默认模型。
    expect(catalog.map((model) => model.model)).toEqual([
      DEFAULT_MODEL,
      "DeepSeek-V4-Pro",
      "GLM-5.3",
      "Kimi-K2.7-Code",
      "qwen3-coder-plus",
    ]);

    // 目录首行 = 默认模型，必须与 config.toml 的 model 一致。
    expect(preset?.config).toContain(`model = "${catalog[0]?.model}"`);

    for (const model of catalog) {
      expect(
        model.contextWindow,
        `${model.model} contextWindow`,
      ).toBeGreaterThan(0);
      expect(model.inputModalities, `${model.model} inputModalities`).toContain(
        "text",
      );
    }
    // Kimi K2.7 Code 支持图像输入。
    expect(
      catalog.find((model) => model.model === "Kimi-K2.7-Code")
        ?.inputModalities,
    ).toEqual(["text", "image"]);
  });

  it("uses the Codex NativeResponses profile for the direct gateway", () => {
    const preset = codexProviderPresets.find(
      (item) => item.name === "模力方舟",
    );

    // moark.com 不在 CODEX_NATIVE_RESPONSES_HOSTS 兜底名单里，而这条路径是原生
    // Responses 直连、没有代理去改写 custom→function。不显式声明 apiFormat 会让
    // resolve_codex_catalog_tool_profile 落成 ProxyChat，即克隆 gpt-5.5 模板
    // （GPT-5 harness + 自由格式 apply_patch），给聚合平台下发它未承诺的能力。
    expect(preset?.apiFormat).toBe("openai_responses");
  });

  it("declares only platform- or vendor-verified Codex reasoning levels", () => {
    const preset = codexProviderPresets.find(
      (item) => item.name === "模力方舟",
    );
    const levels = Object.fromEntries(
      (preset?.modelCatalog ?? []).map((model) => [
        model.model,
        model.reasoningLevels,
      ]),
    );

    // 实测自 https://moark.com/v1/responses：非法 reasoning_effort 触发的 400
    // 里厂商给出的明文枚举。
    expect(levels["DeepSeek-V4-Pro"]).toEqual([
      "low",
      "medium",
      "high",
      "xhigh",
      "max",
    ]);
    expect(levels["GLM-5.3"]).toEqual([
      "none",
      "low",
      "medium",
      "high",
      "xhigh",
      "max",
    ]);
    expect(levels["Kimi-K2.7-Code"]).toEqual([
      "none",
      "minimal",
      "low",
      "medium",
      "high",
      "xhigh",
    ]);
    // MoArk 不校验该字段，退回 DeepSeek 官方目录的档位。
    expect(levels[DEFAULT_MODEL]).toEqual(["low", "high", "max"]);
    // MoArk 对 qwen3-coder-plus 完全不兑现 effort（none 与 ultra 的
    // reasoning_tokens 同为 0）。留空不等于"没有档位"：后端会把未填写理解为沿用
    // 原生模板的 none/high 两档、默认 high，Codex 仍会给出一个不改变任何行为的
    // 选择器，所以要显式声明单档 none。
    expect(levels["qwen3-coder-plus"]).toEqual(["none"]);

    // 只有单档时 Codex 直接应用、不显示选择界面；四款支持思考的模型必须保留多档
    // 且每档都含 high，后端才会保留模板默认 high，与 config 的
    // model_reasoning_effort = "high" 一致。
    const thinkingModels = (preset?.modelCatalog ?? []).filter(
      (model) => model.model !== "qwen3-coder-plus",
    );
    expect(thinkingModels).toHaveLength(4);
    for (const model of thinkingModels) {
      expect(model.reasoningLevels, `${model.model} keeps high`).toContain(
        "high",
      );
      expect(
        model.reasoningLevels?.length,
        `${model.model} still offers a choice`,
      ).toBeGreaterThan(1);
    }
    expect(preset?.config).toContain('model_reasoning_effort = "high"');
  });

  it("registers the MoArk mark in the icon registry", () => {
    expect(hasIcon("moark")).toBe(true);
    expect(getIcon("moark")).toContain("<title>MoArk</title>");
    expect(getIcon("moark")).toContain('viewBox="0 0 88 88"');
  });
});
