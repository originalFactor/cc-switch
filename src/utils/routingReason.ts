import type { TFunction } from "i18next";
import type { AppId } from "@/lib/api";
import type { Provider } from "@/types";
import {
  extractCodexWireApi,
  isCodexAnthropicWireApi,
  isCodexChatWireApi,
} from "@/utils/providerConfigUtils";
import { providerNeedsRouting } from "@/utils/providerCapabilities";

/**
 * 这家为什么需要路由（「需要路由」徽标的说明、直连切换时的提示、对话框 F 的正文都用它）。
 * 不需要路由时返回 null。
 */
export function getRoutingReason(
  app: AppId,
  provider: Provider,
  t: TFunction,
): string | null {
  const isCopilotProvider =
    app === "claude" && provider.meta?.providerType === "github_copilot";
  const isCodexChatFormat =
    (app === "codex" || app === "grokbuild") &&
    (provider.meta?.apiFormat === "openai_chat" ||
      (typeof (provider.settingsConfig as Record<string, any>)?.config ===
        "string" &&
        isCodexChatWireApi(
          extractCodexWireApi(
            (provider.settingsConfig as Record<string, any>).config,
          ),
        )));
  const isCodexAnthropicFormat =
    (app === "codex" || app === "grokbuild") &&
    (provider.meta?.apiFormat === "anthropic" ||
      (typeof (provider.settingsConfig as Record<string, any>)?.config ===
        "string" &&
        isCodexAnthropicWireApi(
          extractCodexWireApi(
            (provider.settingsConfig as Record<string, any>).config,
          ),
        )));

  // Determine why this provider requires the proxy.
  let proxyRequiredReason: string | null = null;
  if (providerNeedsRouting(app, provider)) {
    if (isCopilotProvider) {
      proxyRequiredReason = t("notifications.proxyReasonCopilot", {
        defaultValue: "使用 GitHub Copilot 作为 Claude 供应商",
      });
    } else if (provider.meta?.apiFormat === "openai_chat" && app === "claude") {
      proxyRequiredReason = t("notifications.proxyReasonOpenAIChat", {
        defaultValue: "使用 OpenAI Chat 接口格式",
      });
    } else if (
      provider.meta?.apiFormat === "openai_responses" &&
      app === "claude"
    ) {
      proxyRequiredReason = t("notifications.proxyReasonOpenAIResponses", {
        defaultValue: "使用 OpenAI Responses 接口格式",
      });
    } else if (isCodexChatFormat) {
      proxyRequiredReason = t("notifications.proxyReasonOpenAIChat", {
        defaultValue: "使用 OpenAI Chat 接口格式",
      });
    } else if (isCodexAnthropicFormat) {
      proxyRequiredReason = t("notifications.proxyReasonAnthropicMessages", {
        defaultValue: "使用 Anthropic Messages 接口格式",
      });
    } else if (
      provider.meta?.isFullUrl &&
      (app === "claude" || app === "codex" || app === "grokbuild")
    ) {
      proxyRequiredReason = t("notifications.proxyReasonFullUrl", {
        defaultValue: "开启了完整 URL 连接模式",
      });
    } else {
      proxyRequiredReason = t("notifications.proxyReasonRoutingRequired", {
        defaultValue: "需要本地路由处理请求",
      });
    }
  }
  return proxyRequiredReason;
}
