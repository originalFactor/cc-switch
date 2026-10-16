import type { AppId } from "@/lib/api";
import type { Provider } from "@/types";
import {
  extractCodexBaseUrl,
  extractCodexExperimentalBearerToken,
  extractCodexWireApi,
  hasExplicitNonOpenAiCodexModelProvider,
  isCodexAnthropicWireApi,
  isCodexChatWireApi,
} from "@/utils/providerConfigUtils";

export const CODEX_OFFICIAL_PROVIDER_ID = "codex-official";
export const GROKBUILD_OFFICIAL_PROVIDER_ID = "grokbuild-official";

export type CodexOfficialIdentity = "native_login" | "api_key";

const nonEmptyString = (value: unknown): boolean =>
  typeof value === "string" && value.trim().length > 0;

function hasExplicitCodexThirdPartyUpstream(
  settings: Record<string, unknown>,
): boolean {
  const config = typeof settings.config === "string" ? settings.config : "";

  return (
    nonEmptyString(settings.baseUrl) ||
    nonEmptyString(settings.baseURL) ||
    nonEmptyString(settings.base_url) ||
    Boolean(extractCodexExperimentalBearerToken(config)) ||
    Boolean(extractCodexBaseUrl(config)) ||
    hasExplicitNonOpenAiCodexModelProvider(config)
  );
}

function hasStoredCodexApiKey(settings: Record<string, unknown>): boolean {
  const auth = settings.auth as Record<string, unknown> | undefined;
  return nonEmptyString(auth?.OPENAI_API_KEY);
}

export function resolveCodexOfficialIdentity(
  appId: AppId,
  provider: Pick<Provider, "id" | "category" | "meta" | "settingsConfig">,
): CodexOfficialIdentity | null {
  if (appId !== "codex") return null;

  const hasFixedOfficialId = provider.id === CODEX_OFFICIAL_PROVIDER_ID;
  if (hasFixedOfficialId && provider.category === "official") {
    return "native_login";
  }

  const settings = provider.settingsConfig as Record<string, unknown>;
  const auth = settings?.auth;
  const config = settings?.config;
  if (
    !auth ||
    typeof auth !== "object" ||
    Array.isArray(auth) ||
    (config != null && typeof config !== "string")
  ) {
    return null;
  }

  if (hasExplicitCodexThirdPartyUpstream(settings)) {
    return null;
  }

  if (hasStoredCodexApiKey(settings)) {
    return provider.category === "official" ? "api_key" : null;
  }
  return hasFixedOfficialId || provider.category === "official"
    ? "native_login"
    : null;
}

/**
 * 官方账号卡（对应后端 `codex_direct::is_official`）：Codex 早期官方卡没有 category，
 * 按身份认。
 */
export function isOfficialAccount(
  appId: AppId,
  provider: Pick<Provider, "id" | "category" | "meta" | "settingsConfig">,
): boolean {
  return (
    provider.category === "official" ||
    resolveCodexOfficialIdentity(appId, provider) !== null
  );
}

/**
 * 能进故障转移队列（对应后端 `provider_router::provider_supports_failover`）：
 * Codex 官方账号卡靠客户端自己的登录走路由，不能和别家轮换。
 */
export function supportsFailover(
  appId: AppId,
  provider: Pick<Provider, "id" | "category" | "meta" | "settingsConfig">,
): boolean {
  return !supportsOfficialProxyTakeover(appId, provider);
}

/** Keep the UI capability rule aligned with the Rust takeover policy. */
export function supportsOfficialProxyTakeover(
  appId: AppId,
  provider: Pick<Provider, "id" | "category" | "meta" | "settingsConfig">,
): boolean {
  const identity = resolveCodexOfficialIdentity(appId, provider);
  return identity != null && identity !== "api_key";
}

/**
 * 供应商在指定应用下是否必须开启路由接管才能正常工作（badge 与切换警告共用的权威谓词）。
 *
 * 权威信号是 `providerType`：托管 OAuth 供应商的凭据由本地代理按请求注入
 * （见 `forwarder.rs`，注入发生在转发路径上，请求必须经过代理 = 接管当前应用），
 * 且后端按 providerType 强制托管认证/格式而**无视 apiFormat**。因此 apiFormat
 * 只是可能被用户改动或旧数据缺省的次要信号，OAuth 供应商一律以 providerType 判定。
 *
 * - Claude Desktop 的普通供应商按 direct/proxy 模式判定；托管 OAuth 没有
 *   direct 逃生口（后端同样拒绝），始终需要本地路由。
 * - claude / codex / grokbuild 按各自原生格式及完整 URL 模式判断是否需要本地处理。
 */
export function providerNeedsRouting(
  appId: AppId,
  provider: Provider,
): boolean {
  if (isOfficialAccount(appId, provider)) return false;

  if (appId === "claude-desktop") {
    return provider.meta?.claudeDesktopMode === "proxy";
  }

  if (appId !== "claude" && appId !== "codex" && appId !== "grokbuild") {
    return false;
  }

  if (appId === "claude") {
    const fmt = provider.meta?.apiFormat;
    // Claude 原生是 Anthropic 格式，任何非 anthropic 格式都需要代理转换。
    return provider.meta?.isFullUrl === true || (!!fmt && fmt !== "anthropic");
  }

  if (appId === "codex" || appId === "grokbuild") {
    const fmt = provider.meta?.apiFormat;
    // Codex 原生是 Responses，仅 Chat / Anthropic 需要转换（Responses 直连）。
    if (
      provider.meta?.isFullUrl === true ||
      fmt === "openai_chat" ||
      fmt === "anthropic"
    )
      return true;
    const config = (provider.settingsConfig as Record<string, unknown>)?.config;
    return (
      typeof config === "string" &&
      (isCodexChatWireApi(extractCodexWireApi(config)) ||
        isCodexAnthropicWireApi(extractCodexWireApi(config)))
    );
  }

  return false;
}
