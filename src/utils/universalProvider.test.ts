import { describe, expect, it } from "vitest";
import {
  applyQuickModel,
  compactLimitFrom,
  effortOptionsFor,
} from "./universalProvider";
import type { AvailableModel, UniversalProviderModels } from "@/types";

const models: AvailableModel[] = [
  { id: "gpt-5.6-sol", contextWindow: 131072, efforts: ["low", "high"] },
  { id: "glm-5.3-flash", contextWindow: 200000, efforts: [] },
  { id: "mystery" },
];

describe("compactLimitFrom", () => {
  // 后端 to_codex_provider 用整数除法，这里必须同规则（截断），否则预览和写进
  // config.toml 的值会不一样。
  it("floors the window times percent", () => {
    expect(compactLimitFrom(131072, 90)).toBe(117964);
    expect(compactLimitFrom(1000000, 90)).toBe(900000);
  });

  it("needs both the window and the percent", () => {
    expect(compactLimitFrom(undefined, 90)).toBeUndefined();
    expect(compactLimitFrom(131072, undefined)).toBeUndefined();
    expect(compactLimitFrom(131072, 0)).toBeUndefined();
  });
});

describe("effortOptionsFor", () => {
  it("keeps only the presets the model declares, in preset order", () => {
    expect(effortOptionsFor(models, "gpt-5.6-sol")).toEqual(["low", "high"]);
  });

  // 没声明档位的行（和没选模型时）退回预置全集：不知道能力就别拦着用户填。
  it("falls back to every preset when the model declares none", () => {
    expect(effortOptionsFor(models, "glm-5.3-flash")).toEqual([
      "none",
      "minimal",
      "low",
      "medium",
      "high",
      "xhigh",
      "max",
      "ultra",
    ]);
    expect(effortOptionsFor(models, undefined)).toContain("ultra");
  });

  // 旧记录的手填值可能不在模型的档位里：留在选项里，否则下拉找不到对应项会显示成
  // 空白，看起来像配置丢了。
  it("keeps a stored value the model no longer declares", () => {
    expect(effortOptionsFor(models, "gpt-5.6-sol", "medium")).toEqual([
      "low",
      "high",
      "medium",
    ]);
    expect(effortOptionsFor(models, "gpt-5.6-sol", "high")).toEqual([
      "low",
      "high",
    ]);
  });
});

describe("applyQuickModel", () => {
  it("把模型写进所有应用的所有槽位", () => {
    const out = applyQuickModel({
      models: {},
      modelId: "glm-5.3",
      desktopMode: "proxy",
    });
    // Claude Code：四档 + 主模型 + 子代理
    expect(out.claude).toMatchObject({
      model: "glm-5.3",
      sonnetModel: "glm-5.3",
      opusModel: "glm-5.3",
      fableModel: "glm-5.3",
      haikuModel: "glm-5.3",
      subagentModel: "glm-5.3",
    });
    // Claude Desktop：映射模式填四档路由
    expect(out.claudeDesktop?.mode).toBe("proxy");
    expect(Object.keys(out.claudeDesktop?.routes ?? {})).toEqual([
      "claude-sonnet-5",
      "claude-opus-5",
      "claude-fable-5",
      "claude-haiku-4-5",
    ]);
    expect(out.claudeDesktop?.routes?.["claude-sonnet-5"]).toEqual({
      model: "glm-5.3",
    });
    // Codex：主模型 + 子代理
    expect(out.codex?.model).toBe("glm-5.3");
    expect(out.codex?.subagentModel).toBe("glm-5.3");
    // Gemini / Grok Build
    expect(out.gemini?.model).toBe("glm-5.3");
    expect(out.grokbuild?.model).toBe("glm-5.3");
  });

  it("传了 effort 就写 Codex 主/子代理档位，不传就不写", () => {
    const withEffort = applyQuickModel({
      models: {},
      modelId: "deepseek-v4",
      desktopMode: "proxy",
      reasoningEffort: "high",
    });
    expect(withEffort.codex?.reasoningEffort).toBe("high");
    // 子代理 effort 缺省不写（跟主模型同档位才需要显式配）
    expect(withEffort.codex?.subagentReasoningEffort).toBeUndefined();

    const noEffort = applyQuickModel({
      models: {},
      modelId: "deepseek-v4",
      desktopMode: "proxy",
    });
    expect(noEffort.codex?.reasoningEffort).toBeUndefined();
  });

  it("逐档覆盖：点名的档换成别的模型，其余档跟所选模型", () => {
    const existing: UniversalProviderModels = {
      claude: {
        model: "keep-main",
        apiFormat: "anthropic",
      },
      codex: { model: "keep-codex", autoCompactPercent: 90 },
    };
    const out = applyQuickModel({
      models: existing,
      modelId: "glm-5.3",
      desktopMode: "proxy",
      slots: { sonnet: "only-sonnet" },
    });
    // 点名的档换成指定模型
    expect(out.claude?.sonnetModel).toBe("only-sonnet");
    // 没点名的档都跟所选模型（四档一键配的核心行为）
    expect(out.claude?.haikuModel).toBe("glm-5.3");
    expect(out.claude?.opusModel).toBe("glm-5.3");
    expect(out.claude?.model).toBe("glm-5.3");
    // 非模型字段不动
    expect(out.claude?.apiFormat).toBe("anthropic");
    expect(out.codex?.autoCompactPercent).toBe(90);
  });

  it("显式空串清空该档的模型", () => {
    const existing: UniversalProviderModels = {
      claude: { haikuModel: "old-haiku" },
    };
    const out = applyQuickModel({
      models: existing,
      modelId: "glm-5.3",
      desktopMode: "proxy",
      slots: { haiku: "" },
    });
    expect(out.claude?.haikuModel).toBeUndefined();
    expect(out.claude?.sonnetModel).toBe("glm-5.3");
  });

  it("直连模式不碰 Claude Desktop 路由", () => {
    const existing: UniversalProviderModels = {
      claudeDesktop: { mode: "direct" },
    };
    const out = applyQuickModel({
      models: existing,
      modelId: "claude-sonnet-5",
      desktopMode: "direct",
    });
    expect(out.claudeDesktop).toEqual({ mode: "direct" });
  });

  it("空模型 id 什么都不改", () => {
    const existing: UniversalProviderModels = { claude: { model: "keep" } };
    expect(applyQuickModel({ models: existing, modelId: "   " })).toBe(
      existing,
    );
  });

  it("不改动传入的 models 对象", () => {
    const existing: UniversalProviderModels = { claude: { model: "keep" } };
    applyQuickModel({
      models: existing,
      modelId: "glm-5.3",
      desktopMode: "proxy",
    });
    expect(existing.claude?.model).toBe("keep");
  });
});

describe("applyQuickModel — 修复回归", () => {
  it("effort 同时写进主档位和子代理档位", () => {
    const out = applyQuickModel({
      models: {},
      modelId: "deepseek-v4",
      desktopMode: "proxy",
      reasoningEffort: "high",
      subagentReasoningEffort: "high",
    });
    expect(out.codex?.reasoningEffort).toBe("high");
    expect(out.codex?.subagentReasoningEffort).toBe("high");
  });

  it("不传 effort 时主档位和子代理档位都不写", () => {
    const out = applyQuickModel({
      models: {},
      modelId: "deepseek-v4",
      desktopMode: "proxy",
    });
    expect(out.codex?.reasoningEffort).toBeUndefined();
    expect(out.codex?.subagentReasoningEffort).toBeUndefined();
  });

  it("Desktop 路由在直连往返后保留（模式切换不清表）", () => {
    // 模拟：快速配置写入 → 切直连（行保留在状态里）→ 切回映射
    const afterQuick = applyQuickModel({
      models: {},
      modelId: "glm-5.3",
      desktopMode: "proxy",
    });
    expect(Object.keys(afterQuick.claudeDesktop?.routes ?? {})).toHaveLength(4);
    // 再次快速配置（映射模式）：路由仍完整，不被直连往返清掉
    const afterRoundTrip = applyQuickModel({
      models: afterQuick,
      modelId: "glm-5.3",
      desktopMode: "proxy",
    });
    expect(
      Object.keys(afterRoundTrip.claudeDesktop?.routes ?? {}),
    ).toHaveLength(4);
  });
});

describe("applyQuickModel — API 类型", () => {
  it("anthropic 写进 Claude/Desktop/Codex/Grok（各自的值集）", () => {
    const out = applyQuickModel({
      models: {},
      modelId: "claude-sonnet-5",
      desktopMode: "proxy",
      apiFormat: "anthropic",
    });
    expect(out.claude?.apiFormat).toBe("anthropic");
    expect(out.claudeDesktop?.apiFormat).toBe("anthropic");
    expect(out.codex?.apiFormat).toBe("anthropic");
    expect(out.grokbuild?.apiBackend).toBe("anthropic_messages");
  });

  it("openai_chat / openai_responses 映射到各应用的值", () => {
    const chat = applyQuickModel({
      models: {},
      modelId: "m",
      desktopMode: "proxy",
      apiFormat: "openai_chat",
    });
    expect(chat.claude?.apiFormat).toBe("openai_chat");
    expect(chat.codex?.apiFormat).toBe("openai_chat");
    expect(chat.grokbuild?.apiBackend).toBe("chat_completions");

    const responses = applyQuickModel({
      models: {},
      modelId: "m",
      desktopMode: "proxy",
      apiFormat: "openai_responses",
    });
    expect(responses.codex?.apiFormat).toBe("openai_responses");
    expect(responses.grokbuild?.apiBackend).toBe("responses");
  });

  it("gemini 只写 Claude 系（Codex/Grok 无对应值，跳过）", () => {
    const out = applyQuickModel({
      models: {},
      modelId: "gemini-3.8-flash",
      desktopMode: "proxy",
      apiFormat: "gemini_native",
    });
    expect(out.claude?.apiFormat).toBe("gemini_native");
    expect(out.claudeDesktop?.apiFormat).toBe("gemini_native");
    // 不支持的组合：不写，也不清掉已有值
    expect(out.codex?.apiFormat).toBeUndefined();
    expect(out.grokbuild?.apiBackend).toBeUndefined();
  });

  it("不传 apiFormat 时不动任何应用的格式字段", () => {
    const existing: UniversalProviderModels = {
      claude: { apiFormat: "openai_chat" },
      codex: { apiFormat: "openai_responses" },
      grokbuild: { apiBackend: "responses" },
    };
    const out = applyQuickModel({
      models: existing,
      modelId: "m",
      desktopMode: "proxy",
    });
    expect(out.claude?.apiFormat).toBe("openai_chat");
    expect(out.codex?.apiFormat).toBe("openai_responses");
    expect(out.grokbuild?.apiBackend).toBe("responses");
  });

  it("直连模式不写 Desktop 的 apiFormat（保存时也会被删）", () => {
    const out = applyQuickModel({
      models: {},
      modelId: "m",
      desktopMode: "direct",
      apiFormat: "anthropic",
    });
    expect(out.claude?.apiFormat).toBe("anthropic");
    expect(out.claudeDesktop?.apiFormat).toBeUndefined();
  });
});
