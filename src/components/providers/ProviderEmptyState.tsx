import { Download, Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import type { AppId } from "@/lib/api/types";

interface ProviderEmptyStateProps {
  appId: AppId;
  onCreate?: () => void;
  onImport?: () => void;
}

/**
 * 供应商页空状态（v7 PANELS_BRIEF 空状态规则）：列表区居中，标题 15/600 +
 * 一段 13px --text-2 + 按钮。页头已经有实心的「添加供应商」，这里一律描边。
 */
export function ProviderEmptyState({
  appId,
  onCreate,
  onImport,
}: ProviderEmptyStateProps) {
  const { t } = useTranslation();
  const showKeyFieldsHint =
    appId === "claude" ||
    appId === "codex" ||
    appId === "gemini" ||
    appId === "grokbuild";

  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <h2 className="text-section text-fg-1">{t("provider.noProviders")}</h2>
      <p className="mt-2 max-w-lg text-body text-fg-2">
        {t("provider.noProvidersDescription")}
      </p>
      {(onImport || onCreate) && (
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          {onImport && (
            <Button variant="neutral" size="regular" onClick={onImport}>
              <Download className="h-4 w-4" />
              {appId === "claude-desktop"
                ? t("provider.importFromClaude")
                : t("provider.importCurrent")}
            </Button>
          )}
          {onCreate && (
            <Button variant="neutral" size="regular" onClick={onCreate}>
              <Plus className="h-4 w-4" />
              {t("provider.addProvider")}
            </Button>
          )}
        </div>
      )}
      {showKeyFieldsHint && (
        <p className="mt-4 max-w-lg text-caption text-fg-3">
          {t("provider.noProvidersDescriptionKeyFields")}
        </p>
      )}
    </div>
  );
}
