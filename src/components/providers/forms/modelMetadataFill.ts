// 从拉取列表选中模型后，把查到的已知参数换成各应用的字段格式补进这一行。
// 统一规则：只补空着的字段，用户填过的值一律不动；布尔和模态只往「支持」方向补。

import type { KnownModelMetadata } from "@/lib/modelMetadata";
import type { CodexCatalogModel } from "@/types";

/** 补全前后是否不同：没补上任何字段时不提示用户。 */
export const metadataFilledAnything = (before: unknown, after: unknown) =>
  JSON.stringify(before) !== JSON.stringify(after);

const isBlank = (value: unknown) =>
  value === undefined || value === null || String(value).trim() === "";

/** 只认文字和图片两种输入（Codex 的模态字段只有这两种）。 */
function textImageModalities(
  modalities: string[] | undefined,
): string[] | undefined {
  if (!modalities) return undefined;
  return modalities.includes("image") ? ["text", "image"] : ["text"];
}

export function fillCodexCatalogModel<T extends CodexCatalogModel>(
  row: T,
  metadata: KnownModelMetadata,
  knownLevels: readonly string[],
): T {
  const next = { ...row };
  if (isBlank(row.contextWindow) && metadata.contextWindow) {
    next.contextWindow = String(metadata.contextWindow);
  }
  if (!row.reasoningLevels?.length && metadata.reasoningEfforts) {
    // 按 Codex 的档位顺序排，丢掉它不认识的值。
    const levels = knownLevels.filter((level) =>
      metadata.reasoningEfforts?.includes(level),
    );
    if (levels.length > 0) next.reasoningLevels = levels;
  }
  if (!row.inputModalities && metadata.inputModalities) {
    next.inputModalities = textImageModalities(metadata.inputModalities);
  }
  return next;
}
