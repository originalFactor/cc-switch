import { describe, expect, it } from "vitest";
import {
  isUniversalChildId,
  universalParentIdOf,
} from "@/utils/universalProvider";

describe("universalProvider id helpers", () => {
  it("从子卡 id 反推父级 id（每个应用）", () => {
    expect(universalParentIdOf("universal-codex-abc-123", "codex")).toBe(
      "abc-123",
    );
    expect(universalParentIdOf("universal-claude-u1", "claude")).toBe("u1");
    expect(
      universalParentIdOf("universal-claude-desktop-u1", "claude-desktop"),
    ).toBe("u1");
    expect(
      universalParentIdOf("universal-gemini-元素数据api-179", "gemini"),
    ).toBe("元素数据api-179");
    expect(universalParentIdOf("universal-grokbuild-u2", "grokbuild")).toBe(
      "u2",
    );
  });

  it("父级 id 本身带连字符时整体保留", () => {
    expect(universalParentIdOf("universal-codex-a-b-c", "codex")).toBe("a-b-c");
  });

  it("应用段按最长优先，claude-desktop 不会被当成 claude 的子卡", () => {
    expect(
      universalParentIdOf("universal-claude-desktop-u1", "claude-desktop"),
    ).toBe("u1");
    // 传 claude 时应用段对不上，不算 claude 的子卡
    expect(
      universalParentIdOf("universal-claude-desktop-u1", "claude"),
    ).toBeUndefined();
    expect(isUniversalChildId("universal-codex-u1", "claude")).toBe(false);
    expect(isUniversalChildId("universal-codex-u1", "codex")).toBe(true);
  });

  it("普通供应商与官方种子都不是子卡", () => {
    expect(isUniversalChildId("codex-official", "codex")).toBe(false);
    expect(isUniversalChildId("元素数据api-1790337762935", "codex")).toBe(
      false,
    );
    expect(isUniversalChildId("universal-", "codex")).toBe(false);
  });
});
