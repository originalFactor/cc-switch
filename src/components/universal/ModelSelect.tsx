import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { AvailableModel } from "@/types";

interface ModelSelectProps {
  /** 可选的模型：只有列在这里的才能被选中。 */
  models: AvailableModel[];
  value: string;
  onChange: (value: string) => void;
  /** 无障碍名，也是按钮上没选值时的占位提示。 */
  label: string;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

/**
 * 模型下拉：从供应商拉到的可用模型列表里挑一个。
 *
 * 没有模型列表时不放行自由输入——空列表本身就是「还没拉取」的提示，
 * 由调用方在旁边给出拉取入口。
 */
export function ModelSelect({
  models,
  value,
  onChange,
  label,
  placeholder,
  className,
  disabled,
}: ModelSelectProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  const selected = models.find((model) => model.id === value);
  const empty = models.length === 0;
  // 已存的值可能不在当前列表里（还没拉取，或供应商撤下了这个模型）：照原样显示 id，
  // 不要显示成空白——否则看起来像配置丢了。
  const selectedLabel = selected
    ? (selected.displayName ?? selected.id)
    : value || undefined;

  return (
    <Popover modal open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="regular"
          role="combobox"
          aria-expanded={open}
          aria-label={label}
          disabled={disabled || empty}
          className={cn(
            "h-8 w-full justify-between px-2 font-normal",
            !selectedLabel && "text-fg-3",
            className,
          )}
        >
          <span className="truncate">
            {selectedLabel ??
              placeholder ??
              t("universalProvider.pickModel", { defaultValue: "选择模型" })}
          </span>
          <ChevronsUpDown className="ml-1 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={4}
        collisionPadding={8}
        className="z-[200] w-[--radix-popover-trigger-width] min-w-72 p-0"
      >
        <Command label={label}>
          <CommandInput
            placeholder={t("universalProvider.searchModel", {
              defaultValue: "搜索模型",
            })}
          />
          <CommandList className="max-h-64">
            <CommandEmpty>
              {t("universalProvider.noModelMatch", {
                defaultValue: "没有匹配的模型",
              })}
            </CommandEmpty>
            {models.map((model) => (
              <CommandItem
                key={model.id}
                value={`${model.id} ${model.displayName ?? ""}`}
                onSelect={() => {
                  onChange(model.id);
                  setOpen(false);
                }}
              >
                <Check
                  className={cn(
                    "mr-2 h-4 w-4 shrink-0",
                    value === model.id ? "opacity-100" : "opacity-0",
                  )}
                />
                <span className="min-w-0 flex-1 truncate">
                  {model.displayName ?? model.id}
                </span>
                {/* 列表里已带元信息时，把 id 也显出来，方便对照实际请求的模型名 */}
                {model.displayName && model.displayName !== model.id && (
                  <span className="ml-2 shrink-0 font-mono text-caption text-fg-3">
                    {model.id}
                  </span>
                )}
                {model.contextWindow ? (
                  <span className="ml-2 shrink-0 text-caption text-fg-3">
                    {Math.round(model.contextWindow / 1000)}K
                  </span>
                ) : null}
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
