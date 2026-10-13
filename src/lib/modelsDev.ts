// models.dev 公共数据（https://models.dev/api.json）的拉取与原始结构。
// 用量统计的价格导入和供应商表单的模型参数补全共用这一份数据和查询缓存。

import { queryOptions } from "@tanstack/react-query";

export const MODELS_DEV_API_URL = "https://models.dev/api.json";
const MODELS_DEV_STALE_TIME_MS = 60 * 60 * 1000;
const MODELS_DEV_FETCH_TIMEOUT_MS = 15_000;

export interface ModelsDevCost {
  input?: number;
  output?: number;
  cache_read?: number;
  cache_write?: number;
}

export interface ModelsDevModalities {
  input?: string[];
  output?: string[];
}

export interface ModelsDevLimit {
  context?: number;
  input?: number;
  output?: number;
}

export interface ModelsDevReasoningOption {
  type?: string;
  values?: string[];
}

export interface ModelsDevModel {
  id?: string;
  name?: string;
  release_date?: string;
  cost?: ModelsDevCost;
  modalities?: ModelsDevModalities;
  limit?: ModelsDevLimit;
  reasoning?: boolean;
  reasoning_options?: ModelsDevReasoningOption[];
  // 转售 / 聚合商的条目指回原厂条目，形如 "zhipuai/glm-5"。
  canonical_model_id?: string;
  status?: string;
}

export interface ModelsDevProvider {
  id?: string;
  name?: string;
  // 供应商的 API 基址，按它把用户填的地址认成某一家。
  api?: string;
  models?: Record<string, ModelsDevModel>;
}

export type ModelsDevResponse = Record<string, ModelsDevProvider>;

export async function fetchModelsDev(): Promise<ModelsDevResponse> {
  const controller = new AbortController();
  const timeout = window.setTimeout(
    () => controller.abort(),
    MODELS_DEV_FETCH_TIMEOUT_MS,
  );
  try {
    const response = await fetch(MODELS_DEV_API_URL, {
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return (await response.json()) as ModelsDevResponse;
  } finally {
    window.clearTimeout(timeout);
  }
}

/**
 * models.dev 的查询参数，所有用到它的地方共用一份缓存，1 小时内不重新请求。
 * 表单只预取不订阅，没有订阅者时缓存按 gcTime 回收（默认 5 分钟），这里与
 * staleTime 对齐。
 */
export const modelsDevQueryOptions = queryOptions({
  queryKey: ["models-dev"],
  queryFn: fetchModelsDev,
  staleTime: MODELS_DEV_STALE_TIME_MS,
  gcTime: MODELS_DEV_STALE_TIME_MS,
});

/**
 * 定价键的归一化：去掉命名空间前缀（`vendor/`）、`:变体` 后缀和 `[1m]` 标记后小写。
 *
 * 用法统计运行时是按 `model_pricing.model_id = <用量里的模型名>` 精确匹配的，而
 * models.dev 的键是带命名空间的（`anthropic/claude-opus-4-6`）、用量里记的是裸名
 * （`claude-opus-4-6`）。所以定价键必须继续剥命名空间，否则已存的价格行会全部失配。
 *
 * 模糊匹配（可忽略任意前后缀、最长匹配）用 [`modelMatchScore`] / [`bestModelMatch`]，
 * 不要拿这个函数当匹配器。
 */
export function normalizeModelsDevModelId(modelId: string): string {
  const afterSlash = modelId.slice(modelId.lastIndexOf("/") + 1);
  const beforeColon = afterSlash.split(":")[0] ?? "";
  let normalized = beforeColon.trim().replace(/@/g, "-").toLowerCase();
  if (normalized.endsWith("[1m]")) {
    normalized = normalized.slice(0, -"[1m]".length).trim();
  }
  return normalized;
}

/** 模型 id 切成 token：按**任意**非字母数字分隔符切开，不限于 `/` 和 `-`。 */
export function modelTokens(modelId: string): string[] {
  const lowered = modelId.trim().toLowerCase();
  const withoutMarker = lowered.endsWith("[1m]")
    ? lowered.slice(0, -"[1m]".length).trimEnd()
    : lowered;
  return withoutMarker.split(/[^a-z0-9]+/).filter((token) => token.length > 0);
}

/** 两个 token 序列里最长的连续公共片段长度（即「核心段」）。 */
function longestCommonTokenRun(
  query: readonly string[],
  candidate: readonly string[],
): number {
  let best = 0;
  for (let i = 0; i < query.length; i += 1) {
    for (let j = 0; j < candidate.length; j += 1) {
      let run = 0;
      while (
        i + run < query.length &&
        j + run < candidate.length &&
        query[i + run] === candidate[j + run]
      ) {
        run += 1;
      }
      if (run > best) best = run;
    }
  }
  return best;
}

/**
 * 两个模型 id 的匹配分数 `[核心 token 数, 被忽略的 token 数]`；`null` 表示不匹配。
 *
 * 规则与后端 `model_catalog.rs` 的 `match_score` 一致：两边各自去掉**任意**开头与
 * 结尾 token（分隔符不限，切分只按非字母数字）后核心段相等即命中；多条命中时核心
 * token 最多优先，一样多时忽略 token 最少优先。核心只有一个 token 太弱，除非它就是
 * 较短那一侧的全部。
 */
export function modelMatchScore(
  query: string,
  candidate: string,
): [core: number, ignored: number] | null {
  const a = modelTokens(query);
  const b = modelTokens(candidate);
  if (!a.length || !b.length) return null;
  const core = longestCommonTokenRun(a, b);
  const shorter = Math.min(a.length, b.length);
  if (core === 0 || (core < 2 && core !== shorter)) return null;
  return [core, a.length + b.length - 2 * core];
}

/** 在候选里给 query 找最合适的一条（核心最长 → 忽略最少 → 候选顺序）。 */
export function bestModelMatch<T>(
  query: string,
  candidates: readonly T[],
  idOf: (candidate: T) => string,
): T | undefined {
  let best: { item: T; score: [number, number] } | undefined;
  for (const candidate of candidates) {
    const score = modelMatchScore(query, idOf(candidate));
    if (!score) continue;
    if (
      !best ||
      score[0] > best.score[0] ||
      (score[0] === best.score[0] && score[1] < best.score[1])
    ) {
      best = { item: candidate, score };
    }
  }
  return best?.item;
}

