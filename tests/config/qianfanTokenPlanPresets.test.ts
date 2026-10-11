import { describe, expect, it } from "vitest";
import { providerPresets } from "@/config/claudeProviderPresets";
import { claudeDesktopProviderPresets } from "@/config/claudeDesktopProviderPresets";

// 千帆 Token Plan 个人版（2026-07-13 起替代 Coding Plan 发售；存量 Coding
// Plan 可用至到期，旧预设保留并存）。Codex 侧口径由 codexChatProviderPresets
// 与 codexReasoningLevelPresets 两个测试锁定，此处覆盖其余应用。
const PRESET_NAME = "Baidu Qianfan Token Plan";
const ANTHROPIC_BASE =
  "https://qianfan.baidubce.com/anthropic/tokenplan/personal";

describe("Baidu Qianfan Token Plan presets", () => {
  it("Claude preset points every model role at deepseek-v4-pro", () => {
    const preset = providerPresets.find((item) => item.name === PRESET_NAME);
    expect(preset).toBeDefined();

    const env = (preset?.settingsConfig as { env: Record<string, string> }).env;
    expect(env.ANTHROPIC_BASE_URL).toBe(ANTHROPIC_BASE);
    // 官方 Claude Code 接入页（2026-07-30 版）全角色 deepseek-v4-pro
    for (const key of [
      "ANTHROPIC_MODEL",
      "ANTHROPIC_DEFAULT_HAIKU_MODEL",
      "ANTHROPIC_DEFAULT_SONNET_MODEL",
      "ANTHROPIC_DEFAULT_OPUS_MODEL",
    ]) {
      expect(env[key], key).toBe("deepseek-v4-pro");
    }
  });

  it("Claude Desktop preset proxies the Anthropic-compatible endpoint", () => {
    const preset = claudeDesktopProviderPresets.find(
      (item) => item.name === PRESET_NAME,
    );
    expect(preset).toBeDefined();
    expect(preset?.baseUrl).toBe(ANTHROPIC_BASE);
    expect(preset?.mode).toBe("proxy");
    expect(preset?.apiFormat).toBe("anthropic");
  });
});
