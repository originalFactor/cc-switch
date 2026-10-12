import { useMemo } from "react";
import type { AppId } from "@/lib/api";
import type { ProviderCategory } from "@/types";

interface UseApiKeyLinkProps {
  appId: AppId;
  category?: ProviderCategory;
  formWebsiteUrl: string;
}

/**
 * 管理 API Key 获取链接的显示和 URL
 *
 * 预设体系移除后不再有预设自带的应用 Key 链接，直接用表单里填的官网地址。
 */
export function useApiKeyLink({
  appId,
  category,
  formWebsiteUrl,
}: UseApiKeyLinkProps) {
  // 判断是否显示 API Key 获取链接
  const shouldShowApiKeyLink = useMemo(() => {
    return (
      category !== "official" &&
      (category === "cn_official" ||
        category === "aggregator" ||
        category === "third_party")
    );
  }, [category]);

  return {
    shouldShowApiKeyLink:
      appId === "claude" ||
      appId === "claude-desktop" ||
      appId === "codex" ||
      appId === "gemini"
        ? shouldShowApiKeyLink
        : false,
    websiteUrl: formWebsiteUrl,
    isPartner: false,
    partnerPromotionKey: undefined,
  };
}
