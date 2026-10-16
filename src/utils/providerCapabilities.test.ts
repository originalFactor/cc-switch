import { describe, it, expect } from "vitest";
import type { Provider } from "@/types";
import type { AppId } from "@/lib/api";
import {
  providerNeedsRouting,
  resolveCodexOfficialIdentity,
  supportsOfficialProxyTakeover,
} from "@/utils/providerCapabilities";

function mkProvider(overrides: Partial<Provider> = {}): Provider {
  return { id: "p1", name: "Test", settingsConfig: {}, ...overrides };
}

// wire_api 取自 config.toml；chat_completions 需转换（需路由），responses 直连。
const codexConfig = (wireApi: "chat_completions" | "responses") =>
  `model_provider = "custom"\n\n[model_providers.custom]\nname = "X"\nbase_url = "https://x.example/v1"\nwire_api = "${wireApi}"\n`;

describe("providerNeedsRouting", () => {
  it("allows explicit Codex Official cards during takeover", () => {
    const native = mkProvider({
      id: "codex-official",
      category: "official",
      settingsConfig: { auth: {}, config: "" },
    });
    const unbound = mkProvider({
      id: "follow-login",
      category: "official",
      settingsConfig: {
        auth: {
          auth_mode: "chatgpt",
          tokens: { refresh_token: "legacy-live-only-token" },
        },
        config: "",
      },
    });
    expect(resolveCodexOfficialIdentity("codex", native)).toBe("native_login");
    expect(resolveCodexOfficialIdentity("codex", unbound)).toBe("native_login");

    expect(supportsOfficialProxyTakeover("codex", native)).toBe(true);
    expect(supportsOfficialProxyTakeover("codex", unbound)).toBe(true);
  });

  it("does not infer Codex login identity from a stale Official category", () => {
    const storedAuthKey = mkProvider({
      id: "legacy-api-key",
      category: "official",
      settingsConfig: {
        auth: { OPENAI_API_KEY: "sk-legacy" },
        config: "",
      },
    });
    const storedBearer = mkProvider({
      id: "legacy-bearer",
      category: "official",
      settingsConfig: {
        auth: {},
        config: 'experimental_bearer_token = "sk-legacy"',
      },
    });
    const explicitOpenAi = mkProvider({
      id: "official-openai",
      category: "official",
      settingsConfig: {
        auth: { OPENAI_API_KEY: "sk-official" },
        config: 'model_provider = "openai"',
      },
    });
    const grokOfficial = mkProvider({
      id: "grokbuild-official",
      category: "official",
      settingsConfig: { config: "" },
    });
    const unmarkedCustom = mkProvider({
      id: "custom-upstream",
      category: "official",
      settingsConfig: {
        auth: {},
        config:
          'model_provider = "custom"\n[model_providers.custom]\nbase_url = "https://example.com/v1"',
      },
    });
    const implicitCustom = mkProvider({
      id: "implicit-custom-upstream",
      category: "official",
      settingsConfig: {
        auth: {},
        config: 'model_provider = "ollama"',
      },
    });
    expect(resolveCodexOfficialIdentity("codex", storedAuthKey)).toBe(
      "api_key",
    );
    expect(supportsOfficialProxyTakeover("codex", storedAuthKey)).toBe(false);
    expect(resolveCodexOfficialIdentity("codex", storedBearer)).toBeNull();
    expect(resolveCodexOfficialIdentity("codex", explicitOpenAi)).toBe(
      "api_key",
    );
    expect(resolveCodexOfficialIdentity("codex", grokOfficial)).toBeNull();
    expect(resolveCodexOfficialIdentity("codex", unmarkedCustom)).toBeNull();
    expect(resolveCodexOfficialIdentity("codex", implicitCustom)).toBeNull();

    const unifiedSession = mkProvider({
      id: "unified-session",
      category: "official",
      settingsConfig: {
        auth: {},
        config:
          'model_provider = "custom"\n[model_providers.custom]\nname = "OpenAI"\nrequires_openai_auth = true\nsupports_websockets = true\nwire_api = "responses"',
      },
    });
    expect(resolveCodexOfficialIdentity("codex", unifiedSession)).toBe(
      "native_login",
    );
  });

  it("keeps category-less fixed and managed legacy cards recognizable", () => {
    const fixed = mkProvider({
      id: "codex-official",
      settingsConfig: { auth: {}, config: "" },
    });
    const fixedApiKey = mkProvider({
      id: "codex-official",
      settingsConfig: {
        auth: { OPENAI_API_KEY: "sk-legacy" },
        config: "",
      },
    });
    const fixedCustom = mkProvider({
      id: "codex-official",
      settingsConfig: {
        auth: {},
        config: 'model_provider = "custom"',
      },
    });
    expect(resolveCodexOfficialIdentity("codex", fixed)).toBe("native_login");
    expect(resolveCodexOfficialIdentity("codex", fixedApiKey)).toBeNull();
    expect(resolveCodexOfficialIdentity("codex", fixedCustom)).toBeNull();
    expect(providerNeedsRouting("codex", fixed)).toBe(false);
  });

  it("官方供应商一律不需要路由", () => {
    const apps: AppId[] = ["claude", "codex", "claude-desktop"];
    for (const app of apps) {
      expect(
        providerNeedsRouting(
          app,
          mkProvider({
            category: "official",
          }),
        ),
      ).toBe(false);
    }
  });

  describe("Claude 非 OAuth 按格式判定", () => {
    it("anthropic 原生直连不需要路由", () => {
      expect(
        providerNeedsRouting(
          "claude",
          mkProvider({ meta: { apiFormat: "anthropic" } }),
        ),
      ).toBe(false);
    });

    it("apiFormat 缺省视为原生直连，不需要路由", () => {
      expect(providerNeedsRouting("claude", mkProvider({ meta: {} }))).toBe(
        false,
      );
    });

    it("openai_chat 需要路由", () => {
      expect(
        providerNeedsRouting(
          "claude",
          mkProvider({ meta: { apiFormat: "openai_chat" } }),
        ),
      ).toBe(true);
    });

    it("openai_responses 需要路由", () => {
      expect(
        providerNeedsRouting(
          "claude",
          mkProvider({ meta: { apiFormat: "openai_responses" } }),
        ),
      ).toBe(true);
    });
  });

  describe("Codex 非 OAuth 按格式判定（Responses 直连）", () => {
    it("原生 Responses 不需要路由", () => {
      expect(
        providerNeedsRouting(
          "codex",
          mkProvider({ meta: { apiFormat: "openai_responses" } }),
        ),
      ).toBe(false);
    });

    it("Chat 格式需要路由", () => {
      expect(
        providerNeedsRouting(
          "codex",
          mkProvider({ meta: { apiFormat: "openai_chat" } }),
        ),
      ).toBe(true);
    });

    it("Anthropic 格式需要路由", () => {
      expect(
        providerNeedsRouting(
          "codex",
          mkProvider({ meta: { apiFormat: "anthropic" } }),
        ),
      ).toBe(true);
    });

    it("config 里 wire_api=chat_completions 需要路由", () => {
      expect(
        providerNeedsRouting(
          "codex",
          mkProvider({
            settingsConfig: { config: codexConfig("chat_completions") },
          }),
        ),
      ).toBe(true);
    });

    it("config 里 wire_api=responses 不需要路由", () => {
      expect(
        providerNeedsRouting(
          "codex",
          mkProvider({ settingsConfig: { config: codexConfig("responses") } }),
        ),
      ).toBe(false);
    });
  });

  describe("Claude Desktop 路由判定", () => {
    it("proxy 模式需要路由", () => {
      expect(
        providerNeedsRouting(
          "claude-desktop",
          mkProvider({ meta: { claudeDesktopMode: "proxy" } }),
        ),
      ).toBe(true);
    });

    it("direct 模式不需要路由", () => {
      expect(
        providerNeedsRouting(
          "claude-desktop",
          mkProvider({ meta: { claudeDesktopMode: "direct" } }),
        ),
      ).toBe(false);
    });
  });
});
