//! 统一供应商的可用模型列表：`/v1/models` 出 id，models.dev 补名称和上下文窗口。
//!
//! models.dev 的 `models.json` 是一张扁平的 `模型 id -> {name, limit.context, …}` 表
//! （约 470 KB，公开、无需鉴权），所以拉取顺序是：先用供应商自己的凭据取 id 列表，
//! 再拿这份表去补全每个 id 的显示名和上下文窗口；表里没有的 id 只填 id 本身。

use std::collections::BTreeMap;
use std::time::Duration;

use serde::Deserialize;

use crate::provider::AvailableModel;

/// models.dev 的公开模型表。
const MODELS_DEV_URL: &str = "https://models.dev/models.json";
const FETCH_TIMEOUT_SECS: u64 = 25;

/// models.dev 一条模型里我们关心的字段。
#[derive(Debug, Deserialize)]
pub(crate) struct ModelsDevEntry {
    name: Option<String>,
    limit: Option<ModelsDevLimit>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct ModelsDevLimit {
    context: Option<u64>,
}

/// 拉取 models.dev 的模型表。失败时返回空表：补全只是锦上添花，
/// 供应商自己给的 id 列表照常可用。
async fn fetch_models_dev() -> BTreeMap<String, ModelsDevEntry> {
    let client = crate::proxy::http_client::get();
    let response = match client
        .get(MODELS_DEV_URL)
        .timeout(Duration::from_secs(FETCH_TIMEOUT_SECS))
        .send()
        .await
    {
        Ok(response) => response,
        Err(e) => {
            log::warn!("拉取 models.dev 模型表失败，跳过补全: {e}");
            return BTreeMap::new();
        }
    };
    if !response.status().is_success() {
        log::warn!("models.dev 模型表返回 {}，跳过补全", response.status());
        return BTreeMap::new();
    }
    match response.json::<BTreeMap<String, ModelsDevEntry>>().await {
        Ok(table) => table,
        Err(e) => {
            log::warn!("解析 models.dev 模型表失败，跳过补全: {e}");
            BTreeMap::new()
        }
    }
}

/// 模型 id 切成 token：按**任意**非字母数字分隔符切开，不限于 `/` 和 `-`。
///
/// 匹配单位是 token（用户定义的「按 token 划分」），所以 `gpt-5.6-luna` 是
/// `["gpt","5","6","luna"]`，`openai/gpt-5.6-luna` 只多一个 `openai`。
/// 大小写与 1M 标记在这里统一。
fn tokens(model_id: &str) -> Vec<String> {
    let lowered = model_id.trim().to_lowercase();
    let without_marker = lowered
        .strip_suffix("[1m]")
        .map(str::trim_end)
        .unwrap_or(&lowered);
    without_marker
        .split(|c: char| !c.is_ascii_alphanumeric())
        .filter(|token| !token.is_empty())
        .map(str::to_string)
        .collect()
}

/// 两个 token 序列里最长的**连续公共片段**长度。
///
/// 这就是「核心段」：两边各自忽略任意数量的开头/结尾 token 后剩下的部分。
fn longest_common_token_run(query: &[String], candidate: &[String]) -> usize {
    let mut best = 0usize;
    for i in 0..query.len() {
        for j in 0..candidate.len() {
            let mut run = 0usize;
            while i + run < query.len()
                && j + run < candidate.len()
                && query[i + run] == candidate[j + run]
            {
                run += 1;
            }
            best = best.max(run);
        }
    }
    best
}

/// 两个模型 id 的匹配分数：`(核心 token 数, 被忽略的 token 数)`。
///
/// 规则（「可忽略前后缀 + 最长匹配」，按 token 划分）：
/// - 两边各自去掉**任意**开头与结尾 token（分隔符不限，`/`、`-`、`.`、`_` 都行，
///   因为切分只按非字母数字），剩下的核心 token 段相等才算命中。
/// - 多条命中时，**核心 token 数最多**者胜。
/// - 核心一样多时，**被忽略的 token 数最少**者胜（`zhipuai/glm-5` 胜过
///   `zhipuai/glm-5.3`：后者还要多丢一个 `3`）。
/// - 核心只有一个 token 太弱，除非它就是较短那一侧的全部（`o1` 这类单 token id
///   才匹配得上；`gpt-reserve` 里的 `gpt` 不算）。
///
/// 返回 `None` 表示不匹配。
fn match_score(query: &str, candidate: &str) -> Option<(usize, usize)> {
    let query = tokens(query);
    let candidate = tokens(candidate);
    if query.is_empty() || candidate.is_empty() {
        return None;
    }
    let core = longest_common_token_run(&query, &candidate);
    let shorter = query.len().min(candidate.len());
    if core == 0 || (core < 2 && core != shorter) {
        return None;
    }
    Some((core, query.len() + candidate.len() - 2 * core))
}

/// 在 models.dev 表里给 `query` 找最合适的一条。
///
/// 排序即胜负：核心 token 更多优先，其次被忽略的 token 更少。完全并列时保留表内先
/// 出现的（表是稳定序，多次调用结果一致）。
pub(crate) fn best_models_dev_match<'a>(
    query: &str,
    table: &'a BTreeMap<String, ModelsDevEntry>,
) -> Option<&'a ModelsDevEntry> {
    let mut best: Option<((usize, usize), &ModelsDevEntry)> = None;
    for (key, entry) in table {
        let Some(score) = match_score(query, key) else {
            continue;
        };
        let better = match best {
            None => true,
            Some((best_score, _)) => {
                score.0 > best_score.0 || (score.0 == best_score.0 && score.1 < best_score.1)
            }
        };
        if better {
            best = Some((score, entry));
        }
    }
    best.map(|(_, entry)| entry)
}

/// 把 ids 逐条补上 models.dev 的名称与上下文窗口。
pub(crate) fn enrich_with_models_dev(
    ids: Vec<String>,
    table: &BTreeMap<String, ModelsDevEntry>,
) -> Vec<AvailableModel> {
    ids.into_iter()
        .map(|id| {
            let hit = best_models_dev_match(&id, table);
            AvailableModel {
                display_name: hit
                    .and_then(|entry| entry.name.clone())
                    .filter(|name| !name.trim().is_empty()),
                context_window: hit
                    .and_then(|entry| entry.limit.as_ref())
                    .and_then(|limit| limit.context)
                    .and_then(entry_limit),
                id,
            }
        })
        .collect()
}

/// `limit.context` 为 0 时当作没填（models.dev 里有少量 0 占位）。
fn entry_limit(context: u64) -> Option<u64> {
    (context > 0).then_some(context)
}

/// 取 id 列表（已按调用方去重），补全后返回。
pub async fn build_available_models(ids: Vec<String>) -> Vec<AvailableModel> {
    let table = fetch_models_dev().await;
    enrich_with_models_dev(ids, &table)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn entry(name: Option<&str>, context: Option<u64>) -> ModelsDevEntry {
        ModelsDevEntry {
            name: name.map(str::to_string),
            limit: context.map(|context| ModelsDevLimit {
                context: Some(context),
            }),
        }
    }

    #[test]
    fn fills_name_and_context_from_models_dev() {
        let mut table = BTreeMap::new();
        table.insert(
            "zhipuai/glm-5".to_string(),
            entry(Some("GLM-5"), Some(200_000)),
        );

        let out = enrich_with_models_dev(vec!["glm-5".to_string()], &table);
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].id, "glm-5");
        assert_eq!(out[0].display_name.as_deref(), Some("GLM-5"));
        assert_eq!(out[0].context_window, Some(200_000));
    }

    #[test]
    fn keeps_the_id_when_models_dev_has_no_match() {
        let table = BTreeMap::new();
        let out = enrich_with_models_dev(vec!["my-local-model".to_string()], &table);
        assert_eq!(out[0].id, "my-local-model");
        assert_eq!(out[0].display_name, None);
        assert_eq!(out[0].context_window, None);
    }

    #[test]
    fn matches_through_arbitrary_affixes_and_delimiters() {
        let mut table = BTreeMap::new();
        table.insert(
            "vendor/Model-X:free".to_string(),
            entry(Some("Model X"), Some(128_000)),
        );

        // 分隔符不限：`/`、`-`、`.`、`_`、`:` 都只是切分点，前后缀可任意忽略
        for probe in [
            "Model-X",
            "model-x",
            "vendor/Model-X:free",
            "VENDOR/MODEL.X_FREE.PREVIEW",
            "someprefix-model-x-somesuffix",
        ] {
            let out = enrich_with_models_dev(vec![probe.to_string()], &table);
            assert_eq!(
                out[0].context_window,
                Some(128_000),
                "probe {probe} should match"
            );
        }
    }

    #[test]
    fn prefers_the_fewest_ignored_tokens_when_cores_tie() {
        let mut table = BTreeMap::new();
        table.insert(
            "zhipuai/glm-5".to_string(),
            entry(Some("GLM-5"), Some(200_000)),
        );
        table.insert(
            "zhipuai/glm-5.3".to_string(),
            entry(Some("GLM-5.3"), Some(300_000)),
        );

        // 两条核心都是 `glm 5`；`zhipuai/glm-5` 只丢命名空间，`glm-5.3` 还多丢一个 `3`。
        let out = enrich_with_models_dev(vec!["glm-5".to_string()], &table);
        assert_eq!(out[0].display_name.as_deref(), Some("GLM-5"));
        assert_eq!(out[0].context_window, Some(200_000));
    }

    #[test]
    fn prefers_the_longer_core_when_the_query_is_the_longer_one() {
        let mut table = BTreeMap::new();
        table.insert("openai/o1".to_string(), entry(Some("o1"), Some(200_000)));
        table.insert(
            "openai/o1-pro".to_string(),
            entry(Some("o1-pro"), Some(200_000)),
        );

        let out = enrich_with_models_dev(vec!["o1-pro".to_string()], &table);
        assert_eq!(out[0].display_name.as_deref(), Some("o1-pro"));
    }

    #[test]
    fn does_not_match_on_a_single_shared_token() {
        let mut table = BTreeMap::new();
        // `gpt-reserve` 与它只共用 `gpt` 一个 token；`codex-auto-review` 与会话条目
        // 只共用 `review` 一个：都不算命中，免得写入错的名称和窗口。
        table.insert(
            "openai/gpt-realtime-2.1".to_string(),
            entry(Some("GPT-Realtime-2.1"), Some(128_000)),
        );
        table.insert(
            "tencent/hy3-preview".to_string(),
            entry(Some("Hy3 preview"), Some(256_000)),
        );

        let out = enrich_with_models_dev(
            vec!["gpt-reserve".to_string(), "codex-auto-review".to_string()],
            &table,
        );
        assert_eq!(out[0].display_name, None);
        assert_eq!(out[0].context_window, None);
        assert_eq!(out[1].display_name, None);
        assert_eq!(out[1].context_window, None);
    }

    #[test]
    fn still_matches_a_single_token_id_that_is_the_whole_shorter_side() {
        let mut table = BTreeMap::new();
        table.insert("openai/o1".to_string(), entry(Some("o1"), Some(200_000)));
        let out = enrich_with_models_dev(vec!["o1".to_string()], &table);
        assert_eq!(out[0].display_name.as_deref(), Some("o1"));
    }

    #[test]
    fn fills_real_gateway_ids_by_tokens() {
        // 用户网关里真实出现过的 id：后缀 `-thinking` / `-high` / `-medium` 要被忽略。
        let mut table = BTreeMap::new();
        table.insert(
            "anthropic/claude-opus-4-6".to_string(),
            entry(Some("Claude Opus 4.6"), Some(200_000)),
        );
        table.insert(
            "google/gemini-3.8-flash".to_string(),
            entry(Some("Gemini 3.8 Flash"), Some(1_000_000)),
        );
        table.insert(
            "openai/gpt-oss-120b".to_string(),
            entry(Some("GPT-OSS 120B"), Some(128_000)),
        );

        let out = enrich_with_models_dev(
            vec![
                "claude-opus-4-6-thinking".to_string(),
                "gemini-3.8-flash-high".to_string(),
                "gpt-oss-120b-medium".to_string(),
            ],
            &table,
        );
        assert_eq!(out[0].context_window, Some(200_000));
        assert_eq!(out[1].context_window, Some(1_000_000));
        assert_eq!(out[2].context_window, Some(128_000));
    }

    #[test]
    fn treats_zero_context_as_missing() {
        let mut table = BTreeMap::new();
        table.insert("m".to_string(), entry(Some("M"), Some(0)));
        let out = enrich_with_models_dev(vec!["m".to_string()], &table);
        assert_eq!(out[0].context_window, None);
        assert_eq!(out[0].display_name.as_deref(), Some("M"));
    }
}
