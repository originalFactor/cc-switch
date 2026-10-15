import { describe, expect, it } from "vitest";
import { compactLimitFrom, effortOptionsFor } from "./universalProvider";
import type { AvailableModel } from "@/types";

const models: AvailableModel[] = [
  { id: "gpt-5.6-sol", contextWindow: 131072, efforts: ["low", "high"] },
  { id: "glm-5.3-flash", contextWindow: 200000, efforts: [] },
  { id: "mystery" },
];

describe("compactLimitFrom", () => {
  // 后端 to_codex_provider 用整数除法，这里必须同规则（截断），否则预览和写进
  // config.toml 的值会不一样。
  it("floors the window times percent", () => {
    expect(compactLimitFrom(131072, 90)).toBe(117964);
    expect(compactLimitFrom(1000000, 90)).toBe(900000);
  });

  it("needs both the window and the percent", () => {
    expect(compactLimitFrom(undefined, 90)).toBeUndefined();
    expect(compactLimitFrom(131072, undefined)).toBeUndefined();
    expect(compactLimitFrom(131072, 0)).toBeUndefined();
  });
});

describe("effortOptionsFor", () => {
  it("keeps only the presets the model declares, in preset order", () => {
    expect(effortOptionsFor(models, "gpt-5.6-sol")).toEqual(["low", "high"]);
  });

  // 没声明档位的行（和没选模型时）退回预置全集：不知道能力就别拦着用户填。
  it("falls back to every preset when the model declares none", () => {
    expect(effortOptionsFor(models, "glm-5.3-flash")).toEqual([
      "none",
      "minimal",
      "low",
      "medium",
      "high",
      "xhigh",
      "max",
      "ultra",
    ]);
    expect(effortOptionsFor(models, undefined)).toContain("ultra");
  });

  // 旧记录的手填值可能不在模型的档位里：留在选项里，否则下拉找不到对应项会显示成
  // 空白，看起来像配置丢了。
  it("keeps a stored value the model no longer declares", () => {
    expect(effortOptionsFor(models, "gpt-5.6-sol", "medium")).toEqual([
      "low",
      "high",
      "medium",
    ]);
    expect(effortOptionsFor(models, "gpt-5.6-sol", "high")).toEqual([
      "low",
      "high",
    ]);
  });
});
