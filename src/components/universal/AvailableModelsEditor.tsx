import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronRight, Plus, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { HoverTip } from "@/components/ui/hover-tip";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ReasoningLevelsEditor } from "@/components/universal/ReasoningLevelsEditor";
import type { AvailableModel } from "@/types";

interface AvailableModelsEditorProps {
  models: AvailableModel[];
  onChange: (models: AvailableModel[]) => void;
  /** 重新从供应商拉取（拉到的会覆盖这张表）。 */
  onRefresh: () => void;
  refreshing?: boolean;
  /** 拉取前的清单，用于「恢复」。没有拉取过时不显示。 */
  fetched?: AvailableModel[];
  disabled?: boolean;
}

/**
 * 统一供应商的模型列表：所有应用共用这一份，表单里的模型下拉也从这里来。
 *
 * 每行可以改 id、显示名和上下文窗口，也可以增删。改过的列表在保存时随供应商一起
 * 提交；「恢复」把列表还原成上次从供应商拉到的样子。
 */
export function AvailableModelsEditor({
  models,
  onChange,
  onRefresh,
  refreshing,
  fetched,
  disabled,
}: AvailableModelsEditorProps) {
  const { t } = useTranslation();

  // 默认收起：模型多的时候列表很长，标题行显示条数，点开才编辑。
  const [open, setOpen] = useState(false);

  // 一行内的临时输入：改完失焦/回车才落到列表上，避免每敲一个字就重建下拉选项。
  const [draft, setDraft] = useState<{ index: number; value: string } | null>(
    null,
  );

  const patch = (index: number, changes: Partial<AvailableModel>) => {
    onChange(
      models.map((model, i) =>
        i === index ? { ...model, ...changes } : model,
      ),
    );
  };

  const dirty =
    fetched !== undefined &&
    JSON.stringify(models) !== JSON.stringify(fetched) &&
    fetched.length > 0;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="space-y-2 rounded-lg border p-3">
        <div className="flex items-center justify-between gap-2">
          <CollapsibleTrigger asChild>
            <button
              type="button"
              aria-expanded={open}
              className="flex min-w-0 flex-1 items-center gap-2 rounded-md text-left"
            >
              <ChevronRight
                className={`h-4 w-4 shrink-0 text-fg-3 transition-transform ${
                  open ? "rotate-90" : ""
                }`}
              />
              <span className="min-w-0">
                <span className="block text-sm font-medium">
                  {t("universalProvider.availableModels", {
                    defaultValue: "可用模型列表",
                  })}
                </span>
                {!open && (
                  <span className="block truncate text-xs text-fg-2">
                    {t("universalProvider.availableModelsHint", {
                      defaultValue:
                        "所有应用共用这一份；下拉里的模型和各应用的模型目录都由它而来。",
                    })}
                  </span>
                )}
              </span>
              {models.length > 0 && (
                <span className="shrink-0 text-xs text-fg-3">
                  {t("universalProvider.availableModelsCount", {
                    defaultValue: "{{count}} 个",
                    count: models.length,
                  })}
                </span>
              )}
            </button>
          </CollapsibleTrigger>
          <div className="flex shrink-0 items-center gap-1">
            {dirty && (
              <HoverTip
                content={t("universalProvider.restoreModels", {
                  defaultValue: "恢复为上次拉取的结果",
                })}
              >
                <Button
                  type="button"
                  variant="quiet"
                  size="icon-compact"
                  aria-label={t("universalProvider.restoreModels", {
                    defaultValue: "恢复为上次拉取的结果",
                  })}
                  onClick={() => onChange(fetched ?? [])}
                >
                  <RotateCcw className="h-4 w-4" />
                </Button>
              </HoverTip>
            )}
            <Button
              type="button"
              variant="outline"
              size="regular"
              onClick={onRefresh}
              disabled={refreshing || disabled}
            >
              {t("universalProvider.fetchModels", {
                defaultValue: "获取模型列表",
              })}
            </Button>
          </div>
        </div>

        <CollapsibleContent>
          <div className="space-y-2">
            {models.length === 0 ? (
              <p className="rounded-md border border-dashed px-3 py-4 text-center text-xs text-fg-2">
                {t("universalProvider.availableModelsEmpty", {
                  defaultValue:
                    "还没有模型。先「获取模型列表」，或手动添加一条。",
                })}
              </p>
            ) : (
              <div className="space-y-1.5">
                {/* 表头：三列含义固定，省得每行都靠占位符猜 */}
                <div className="grid grid-cols-[1fr_1fr_6rem_6rem_10rem_auto] gap-2 px-1 text-caption text-fg-3">
                  <span>
                    {t("universalProvider.modelId", {
                      defaultValue: "模型 ID",
                    })}
                  </span>
                  <span>
                    {t("universalProvider.modelName", {
                      defaultValue: "显示名",
                    })}
                  </span>
                  <span>
                    {t("universalProvider.modelContext", {
                      defaultValue: "上下文窗口",
                    })}
                  </span>
                  <span>
                    {t("universalProvider.modelMaxOutput", {
                      defaultValue: "最大输出",
                    })}
                  </span>
                  <span>
                    {t("universalProvider.effortLevelsLabel", {
                      defaultValue: "思考等级",
                    })}
                  </span>
                  <span />
                </div>
                {models.map((model, index) => (
                  <div
                    key={index}
                    className="grid grid-cols-[1fr_1fr_6rem_6rem_10rem_auto] items-center gap-2"
                  >
                    <Input
                      aria-label={t("universalProvider.modelId", {
                        defaultValue: "模型 ID",
                      })}
                      value={draft?.index === index ? draft.value : model.id}
                      onChange={(event) =>
                        setDraft({ index, value: event.target.value })
                      }
                      onBlur={() => {
                        if (draft?.index !== index) return;
                        const next = draft.value.trim();
                        // id 是这行的身份，清空等于删掉这一行。
                        if (next === "") {
                          onChange(models.filter((_, i) => i !== index));
                        } else {
                          patch(index, { id: next });
                        }
                        setDraft(null);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") event.currentTarget.blur();
                      }}
                      placeholder="gpt-5.6-sol"
                    />
                    <Input
                      aria-label={t("universalProvider.modelName", {
                        defaultValue: "显示名",
                      })}
                      value={model.displayName ?? ""}
                      onChange={(event) =>
                        patch(index, { displayName: event.target.value })
                      }
                      placeholder={model.id}
                    />
                    <Input
                      aria-label={t("universalProvider.modelContext", {
                        defaultValue: "上下文窗口",
                      })}
                      inputMode="numeric"
                      value={model.contextWindow?.toString() ?? ""}
                      onChange={(event) => {
                        const digits = event.target.value.replace(/\D/g, "");
                        patch(index, {
                          contextWindow:
                            digits === "" ? undefined : Number(digits),
                        });
                      }}
                      placeholder="128000"
                    />
                    <Input
                      aria-label={t("universalProvider.modelMaxOutput", {
                        defaultValue: "最大输出",
                      })}
                      inputMode="numeric"
                      value={model.maxOutput?.toString() ?? ""}
                      onChange={(event) => {
                        const digits = event.target.value.replace(/\D/g, "");
                        patch(index, {
                          maxOutput: digits === "" ? undefined : Number(digits),
                        });
                      }}
                      placeholder="64000"
                    />
                    <ReasoningLevelsEditor
                      levels={model.efforts}
                      defaultLevel={model.defaultEffort}
                      onLevelsChange={(levels) =>
                        patch(index, { efforts: levels ?? [] })
                      }
                      onDefaultLevelChange={(level) =>
                        patch(index, { defaultEffort: level })
                      }
                    />
                    <HoverTip
                      content={t("common.delete", { defaultValue: "删除" })}
                    >
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`${t("common.delete", { defaultValue: "删除" })} ${model.id}`}
                        onClick={() =>
                          onChange(models.filter((_, i) => i !== index))
                        }
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </HoverTip>
                  </div>
                ))}
              </div>
            )}

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                onChange([...models, { id: "", displayName: undefined }])
              }
            >
              <Plus className="mr-1 h-3.5 w-3.5" />
              {t("universalProvider.addModelRow", { defaultValue: "手动添加" })}
            </Button>
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
