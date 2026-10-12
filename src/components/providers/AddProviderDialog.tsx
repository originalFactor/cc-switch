import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { FullScreenPanel } from "@/components/common/FullScreenPanel";
import { APP_DISPLAY_NAME } from "@/components/shell/AppGlyph";
import type { AppId } from "@/lib/api";
import { universalProvidersApi } from "@/lib/api";
import type { UniversalProvider } from "@/types";
import { UniversalProviderFormModal } from "@/components/universal/UniversalProviderFormModal";
import { UniversalProviderPanel } from "@/components/universal";

interface AddProviderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appId: AppId;
  /** 从供应商页哪一格打开的；添加统一供应商时只用它判断要不要提示切换应用 */
  modeView?: unknown;
}

/**
 * 添加供应商：统一供应商是唯一的添加入口。
 *
 * 供应商分两种：统一供应商（跨应用共享，一份配置同步到 Claude Code、Claude Desktop、Codex、
 * Gemini CLI、Grok Build）和应用内已有的存量单应用供应商。新增只走统一供应商，不再有预设
 * 选择和按应用区分的自定义表单；单个应用的定制请在供应商列表里编辑那一家。
 */
export function AddProviderDialog({
  open,
  onOpenChange,
  appId,
}: AddProviderDialogProps) {
  const { t } = useTranslation();
  const [universalFormOpen, setUniversalFormOpen] = useState(false);
  const [manageUniversalOpen, setManageUniversalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setUniversalFormOpen(true);
      setIsSubmitting(false);
    }
  }, [open]);

  const closeDialog = useCallback(() => {
    setUniversalFormOpen(false);
    setManageUniversalOpen(false);
    onOpenChange(false);
  }, [onOpenChange]);

  const handleUniversalFormClose = useCallback(() => {
    // 表单关掉就整个关掉：添加页没有别的内容可回。
    closeDialog();
  }, [closeDialog]);

  const handleUniversalProviderSave = useCallback(
    async (provider: UniversalProvider) => {
      setIsSubmitting(true);
      try {
        await universalProvidersApi.upsert(provider);
      } catch (error) {
        console.error(
          "[AddProviderDialog] Failed to save universal provider",
          error,
        );
        toast.error(
          t("universalProvider.addFailed", {
            defaultValue: "统一供应商添加失败",
          }),
        );
        setIsSubmitting(false);
        return;
      }

      try {
        await universalProvidersApi.sync(provider.id);
        toast.success(
          t("universalProvider.addedAndSynced", {
            defaultValue: "统一供应商已添加并同步",
          }),
        );
      } catch (error) {
        console.error(
          "[AddProviderDialog] Provider saved but sync failed",
          error,
        );
        toast.warning(
          t("universalProvider.addedButSyncFailed", {
            defaultValue: "统一供应商已添加，但同步失败",
          }),
        );
      }

      setIsSubmitting(false);
      onOpenChange(false);
    },
    [t, onOpenChange],
  );

  const subtitle =
    appId === "claude" || appId === "codex" || appId === "gemini"
      ? `${APP_DISPLAY_NAME[appId]} · ${t("universalProvider.add", {
          defaultValue: "添加统一供应商",
        })}`
      : t("universalProvider.add", { defaultValue: "添加统一供应商" });

  return (
    <FullScreenPanel
      isOpen={open}
      title={t("provider.addNewProvider")}
      subtitle={subtitle}
      backLabel={t("provider.backToList")}
      onClose={closeDialog}
      footer={
        <>
          <Button
            type="button"
            variant="neutral"
            size="regular"
            onClick={closeDialog}
          >
            {t("common.cancel")}
          </Button>
          <Button
            type="submit"
            form="universal-provider-form"
            variant="solid"
            size="regular"
            disabled={isSubmitting}
          >
            {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
            {t("common.add")}
          </Button>
        </>
      }
    >
      <UniversalProviderFormModal
        isOpen={universalFormOpen}
        onClose={handleUniversalFormClose}
        onSave={handleUniversalProviderSave}
        submitFormId="universal-provider-form"
      />

      {manageUniversalOpen && (
        <FullScreenPanel
          isOpen={manageUniversalOpen}
          title={t("universalProvider.manage")}
          onClose={() => setManageUniversalOpen(false)}
        >
          <UniversalProviderPanel />
        </FullScreenPanel>
      )}
    </FullScreenPanel>
  );
}
