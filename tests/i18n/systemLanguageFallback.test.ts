import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// 必须动态导入：首屏语言只在模块加载时算一次，测试要用不同的 navigator
// 重新执行模块顶层代码（`vi.resetModules()` + `await import`）。
let loadedI18n:
  { changeLanguage: (language: string) => Promise<unknown> } | undefined;

beforeEach(() => {
  vi.resetModules();
  localStorage.clear();
});
afterEach(async () => {
  await loadedI18n?.changeLanguage("zh");
  loadedI18n = undefined;
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("system language fallback", () => {
  it.each(["de-DE", "fr", "ko-KR"])(
    "uses English for unsupported system language %s",
    async (language) => {
      vi.stubGlobal("navigator", { language });
      const { default: i18n } = await import("@/i18n");
      loadedI18n = i18n;
      expect(i18n.language).toBe("en");
    },
  );

  it("keeps a saved language instead of overriding it with the system language", async () => {
    localStorage.setItem("language", "en");
    vi.stubGlobal("navigator", { language: "de-DE" });
    const { default: i18n } = await import("@/i18n");
    loadedI18n = i18n;
    expect(i18n.language).toBe("en");
  });

  it("falls back to Simplified Chinese when the system language is unreadable", async () => {
    vi.stubGlobal("navigator", { language: "" });
    const { default: i18n } = await import("@/i18n");
    loadedI18n = i18n;
    expect(i18n.language).toBe("zh");
  });
});
