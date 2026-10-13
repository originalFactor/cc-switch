/**
 * 统一供应商的子卡 id 与它们的父级。
 *
 * 同步时后端把每个应用的一份配置写成 `universal-<app>-<父级 id>`（见
 * `provider.rs` 的 `to_*_provider`）。供应商页里看到的这些卡片都属于某个统一供应商，
 * 在任意应用页编辑它们要打开的是**父级**统一供应商的表单，而不是这一份子卡。
 */

import type { AppId } from "@/lib/api";

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
