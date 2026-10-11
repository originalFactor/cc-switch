import { describe, expect, it } from "vitest";

import { codexPresetModelSources } from "@/config/presetModelMetadata";
import { resolveModelMetadata } from "@/lib/modelMetadata";
import type { ModelsDevResponse } from "@/lib/modelsDev";

describe("preset model metadata sources", () => {
  it("collects reviewed model values from codex presets", () => {
    const list = codexPresetModelSources();
    expect(list.length).toBeGreaterThan(0);
    expect(codexPresetModelSources()).toBe(list);
    for (const source of list) {
      expect(source.baseUrl).toBeTruthy();
      expect(source.models.size).toBeGreaterThan(0);
    }
  });

  it("keeps a partner's own window over the vendor default", () => {
    // FluxA 转售的百度国际 team 部署：glm-5.2 是 500K，不是原厂的 1M。
    const modelsDev: ModelsDevResponse = {
      zhipuai: {
        api: "https://open.bigmodel.cn/api/paas/v4",
        models: { "glm-5.2": { limit: { context: 1000000 } } },
      },
      openrouter: {
        models: {
          "z-ai/glm-5.2": { canonical_model_id: "zhipuai/glm-5.2" },
        },
      },
    };
    expect(
      resolveModelMetadata("glm-5.2", {
        baseUrl: "https://api.baiduqianfan.ai/v2/tokenplan/team",
        presets: codexPresetModelSources(),
        modelsDev,
      })?.contextWindow,
    ).toBe(500000);
  });
});
