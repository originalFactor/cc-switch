// 把各应用预设里手工核实过的模型参数整理成 `PresetModelSource`，作为表单补全
// 模型参数时的第一优先级（见 `resolveModelMetadata`）。每个应用首次用到时才整理。

import {
  positiveInteger,
  stringList,
  type KnownModelMetadata,
  type PresetModelSource,
} from "@/lib/modelMetadata";
import { extractCodexBaseUrl } from "@/utils/providerConfigUtils";
import { codexProviderPresets } from "./codexProviderPresets";

function compact(metadata: KnownModelMetadata): KnownModelMetadata | null {
  const entries = Object.entries(metadata).filter(
    ([, value]) => value !== undefined,
  );
  return entries.length > 0
    ? (Object.fromEntries(entries) as KnownModelMetadata)
    : null;
}

function buildSources<M>(
  endpoints: (string | undefined)[],
  models: Iterable<readonly [string, M]>,
  toMetadata: (model: M) => KnownModelMetadata,
): PresetModelSource[] {
  const map = new Map<string, KnownModelMetadata>();
  for (const [id, model] of models) {
    const metadata = id ? compact(toMetadata(model)) : null;
    if (metadata) map.set(id, metadata);
  }
  if (map.size === 0) return [];
  return [...new Set(endpoints.filter((url): url is string => !!url))].map(
    (baseUrl) => ({ baseUrl, models: map }),
  );
}

function lazy<T>(build: () => T): () => T {
  let value: T | undefined;
  return () => (value ??= build());
}

export const codexPresetModelSources = lazy(() =>
  codexProviderPresets.flatMap((preset) =>
    buildSources(
      [
        extractCodexBaseUrl(preset.config),
        ...(preset.endpointCandidates ?? []),
      ],
      (preset.modelCatalog ?? []).map((row) => [row.model, row] as const),
      (row) => ({
        contextWindow: positiveInteger(row.contextWindow),
        reasoningEfforts: stringList(row.reasoningLevels),
        inputModalities: stringList(row.inputModalities),
      }),
    ),
  ),
);
