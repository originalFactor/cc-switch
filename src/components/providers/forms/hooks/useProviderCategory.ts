import { useState, useEffect } from "react";
import type { ProviderCategory } from "@/types";
import type { AppId } from "@/lib/api";

interface UseProviderCategoryProps {
  appId: AppId;
  isEditMode: boolean;
  initialCategory?: ProviderCategory;
}

/**
 * 管理供应商类别状态
 *
 * 预设体系移除后，新增的供应商只有统一供应商生成的子卡（后端写 `aggregator`）和
 * Claude Desktop / Grok Build 的官方种子行（`official`）。这里只沿用行里已有的分类，
 * 不再从预设反推。
 */
export function useProviderCategory({
  isEditMode,
  initialCategory,
}: UseProviderCategoryProps) {
  const [category, setCategory] = useState<ProviderCategory | undefined>(
    isEditMode ? initialCategory : undefined,
  );

  useEffect(() => {
    if (isEditMode) {
      setCategory(initialCategory);
      return;
    }
    setCategory(undefined);
  }, [isEditMode, initialCategory]);

  return { category, setCategory };
}
