/**
 * 统一供应商的子卡 id 与它们的父级。
 *
 * 同步时后端把每个应用的一份配置写成 `universal-<app>-<父级 id>`（见
 * `provider.rs` 的 `to_*_provider`）。供应商页里看到的这些卡片都属于某个统一供应商，
 * 在任意应用页编辑它们要打开的是**父级**统一供应商的表单，而不是这一份子卡。
 */

import type { AppId } from "@/lib/api";
import type { AvailableModel } from "@/types";

/** 应用段全集。解析时按「最长优先」匹配，避免 `claude-` 吃掉 `claude-desktop-`。 */
const APP_IDS: readonly AppId[] = [
  "claude-desktop",
  "claude",
  "codex",
  "gemini",
  "grokbuild",
];

const CHILD_PREFIX = "universal-";

export interface UniversalChildId {
  /** 这个子卡属于哪个应用。 */
  app: AppId;
  /** 父级统一供应商 id。 */
  parentId: string;
}

/**
 * 解析子卡 id。返回 `undefined` 表示这不是统一供应商同步出来的卡片
 * （普通供应商、官方种子等）。
 *
 * 应用段先按最长匹配，所以 `universal-claude-desktop-x` 是 claude-desktop 的子卡，
 * 不会被当成 claude 的；父级 id 本身可能带连字符（迁移时沿用原 id），所以剥掉
 * 「前缀 + 应用段」后剩下的整体都是父级 id。
 */
export function parseUniversalChildId(
  providerId: string,
): UniversalChildId | undefined {
  if (!providerId.startsWith(CHILD_PREFIX)) return undefined;
  const rest = providerId.slice(CHILD_PREFIX.length);
  for (const app of APP_IDS) {
    const prefix = `${app}-`;
    if (rest.startsWith(prefix)) {
      const parentId = rest.slice(prefix.length);
      if (parentId.length > 0) return { app, parentId };
    }
  }
  return undefined;
}

/**
 * 这张卡是统一供应商同步出来的子卡时，返回父级统一供应商 id。
 *
 * 传 `appId` 时会校验子卡确实属于该应用：供应商列表只会列出本应用的卡片，传错应用
 * 时不应把它当成自己的子卡。
 */
export function universalParentIdOf(
  providerId: string,
  appId?: string,
): string | undefined {
  const parsed = parseUniversalChildId(providerId);
  if (!parsed) return undefined;
  if (appId !== undefined && parsed.app !== appId) return undefined;
  return parsed.parentId;
}

/** 这张卡是否由统一供应商同步出来（限定到某个应用时同时校验应用段）。 */
export function isUniversalChildId(
  providerId: string,
  appId?: string,
): boolean {
  return universalParentIdOf(providerId, appId) !== undefined;
}

/**
 * effort 档位全集（预置顺序即展示/写入顺序）。用户在统一供应商里勾选启用哪些；
 * 勾选集与各模型元数据（models.dev reasoning_options）求交集后写进目录的
 * `reasoningLevels`，并约束 effort 下拉的选项。
 */
export const EFFORT_PRESETS = [
  "none",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
  "ultra",
] as const;

/**
 * 压缩阈值：把「上下文窗口的百分比」换算成 Codex 的绝对 token 数（整数除法，和
 * 后端 `to_codex_provider` 同规则）。窗口或百分比缺一就算不出来，返回 `undefined`
 * ——那种情况整条 `model_auto_compact_token_limit` 不写，交给 Codex 自己的默认。
 */
export function compactLimitFrom(
  contextWindow: number | undefined,
  percent: number | undefined,
): number | undefined {
  if (!contextWindow || !percent || percent <= 0) return undefined;
  return Math.floor((contextWindow * percent) / 100);
}

/**
 * effort 下拉的选项：模型行声明的档位（models.dev reasoning_options 的并集，拉取时补全、
 * 模型列表编辑器里可改）与预置全集求交集；该行没声明档位时退回预置全集。
 *
 * 已存的值不在结果里时（旧记录的手填值，或模型撤下了这个档）补到末尾，免得下拉因为
 * 找不到对应项而显示成空白——那样看起来像配置丢了。
 */
export function effortOptionsFor(
  availableModels: AvailableModel[],
  modelId: string | undefined,
  current?: string,
): string[] {
  const id = modelId?.trim();
  const efforts = id
    ? (availableModels.find((model) => model.id === id)?.efforts ?? [])
    : [];
  const options: string[] =
    efforts.length > 0
      ? EFFORT_PRESETS.filter((preset) => efforts.includes(preset))
      : [...EFFORT_PRESETS];
  const value = current?.trim();
  return value && !options.includes(value) ? [...options, value] : options;
}

/**
 * 触发器标签：相邻 ≥3 个的连续预置档位压成「首 → 末」（跳过 minimal 时是
 * "none, low → max"）。范围不会跨过未选档位，所以不会暗示没选的档。
 * 非预置顺序保持原样列表。
 */
export function formatReasoningLevelsLabel(levels: string[]): string {
  const canonical = EFFORT_PRESETS as readonly string[];
  const positions = levels.map((level) => canonical.indexOf(level));
  const ordered = positions.every(
    (position, index) =>
      position >= 0 && (index === 0 || position > positions[index - 1]),
  );
  if (!ordered) return levels.join(", ");

  const parts: string[] = [];
  let runStart = 0;
  for (let index = 1; index <= levels.length; index++) {
    if (
      index < levels.length &&
      positions[index] === positions[index - 1] + 1
    ) {
      continue;
    }
    const run = levels.slice(runStart, index);
    if (run.length >= 3) {
      parts.push(`${run[0]} → ${run[run.length - 1]}`);
    } else {
      parts.push(...run);
    }
    runStart = index;
  }
  return parts.join(", ");
}
