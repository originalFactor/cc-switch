/**
 * GitHub Copilot 用量查询 API
 *
 * 读 Copilot 订阅的 premium requests 配额。多账号路径只在用量脚本模板里用，
 * accountId 为空时后端回落到 Copilot 默认账号。
 */

import { invoke } from "@tauri-apps/api/core";

/** 配额详情 */
export interface QuotaDetail {
  entitlement: number;
  remaining: number;
}

/** 配额快照 */
export interface QuotaSnapshots {
  chat: QuotaDetail;
  completions: QuotaDetail;
  premium_interactions: QuotaDetail;
}

/** Copilot 使用量响应 */
export interface CopilotUsageResponse {
  copilot_plan: string;
  quota_reset_date: string;
  quota_snapshots: QuotaSnapshots;
}

/** 获取 Copilot 使用量信息 */
export async function copilotGetUsage(): Promise<CopilotUsageResponse> {
  return invoke<CopilotUsageResponse>("copilot_get_usage");
}

/** 获取指定账号的 Copilot 使用量信息 */
export async function copilotGetUsageForAccount(
  accountId: string,
): Promise<CopilotUsageResponse> {
  return invoke<CopilotUsageResponse>("copilot_get_usage_for_account", {
    accountId,
  });
}
