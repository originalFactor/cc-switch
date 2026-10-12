import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AddProviderDialog } from "@/components/providers/AddProviderDialog";
import { universalProviderPresets } from "@/config/universalProviderPresets";
import type { UniversalProvider } from "@/types";

const upsert = vi.fn().mockResolvedValue(undefined);
const sync = vi.fn().mockResolvedValue(undefined);

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    universalProvidersApi: {
      getAll: vi.fn().mockResolvedValue({}),
      upsert: (...args: unknown[]) => upsert(...args),
      sync: (...args: unknown[]) => sync(...args),
      delete: vi.fn().mockResolvedValue(true),
    },
  };
});

// 表单是重组件（图标、JSON 编辑器），这里只关心它收到/回传了什么。
let lastSubmitFormId: string | undefined;

vi.mock("@/components/universal/UniversalProviderFormModal", () => ({
  UniversalProviderFormModal: ({
    isOpen,
    onSave,
    submitFormId,
    editingProvider,
    initialPreset,
  }: {
    isOpen: boolean;
    onSave: (provider: UniversalProvider) => void;
    submitFormId?: string;
    editingProvider?: UniversalProvider | null;
    initialPreset?: { name: string } | null;
  }) => {
    if (!isOpen) return null;
    lastSubmitFormId = submitFormId;
    return (
      <div data-testid="universal-form">
        <span data-testid="form-preset">
          {initialPreset ? initialPreset.name : "none"}
        </span>
        <span data-testid="form-editing">
          {editingProvider ? editingProvider.name : "new"}
        </span>
        <button type="button" onClick={() => onSave(savedProvider)}>
          save
        </button>
      </div>
    );
  },
}));

const savedProvider: UniversalProvider = {
  id: "u-new",
  name: "我的网关",
  providerType: "newapi",
  apps: {
    claude: true,
    codex: true,
    gemini: true,
    claudeDesktop: true,
    grokbuild: true,
  },
  baseUrl: "https://api.example.com",
  apiKey: "sk-test",
  models: {},
  createdAt: 1,
};

describe("AddProviderDialog", () => {
  beforeEach(() => {
    upsert.mockClear();
    sync.mockClear();
    lastSubmitFormId = undefined;
  });

  it("打开就直接进入统一供应商表单，没有预设选择那一步", () => {
    render(
      <AddProviderDialog
        open
        onOpenChange={vi.fn()}
        appId="claude"
      />,
    );

    expect(screen.getByTestId("universal-form")).toBeInTheDocument();
    expect(screen.getByTestId("form-editing")).toHaveTextContent("new");
    // 表单自己选默认预设，添加页不预设某一个
    expect(screen.getByTestId("form-preset")).toHaveTextContent("none");
    // 没有 ProviderForm（按应用区分的自定义表单）
    expect(screen.queryByRole("button", { name: "manage-auth" })).toBeNull();
  });

  it("保存时先 upsert 再 sync，成功后关闭", async () => {
    const handleOpenChange = vi.fn();
    render(
      <AddProviderDialog
        open
        onOpenChange={handleOpenChange}
        appId="claude"
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "save" }));

    await waitFor(() => expect(upsert).toHaveBeenCalledTimes(1));
    expect(upsert).toHaveBeenCalledWith(savedProvider);
    expect(sync).toHaveBeenCalledWith("u-new");
    await waitFor(() =>
      expect(handleOpenChange).toHaveBeenCalledWith(false),
    );
  });

  it("sync 失败时也关闭，只是提示降级为警告", async () => {
    sync.mockRejectedValueOnce(new Error("sync failed"));
    const handleOpenChange = vi.fn();
    render(
      <AddProviderDialog open onOpenChange={handleOpenChange} appId="codex" />,
    );

    await userEvent.click(screen.getByRole("button", { name: "save" }));

    await waitFor(() => expect(sync).toHaveBeenCalledTimes(1));
    expect(upsert).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(handleOpenChange).toHaveBeenCalledWith(false),
    );
  });

  it("upsert 失败时不 sync、不关闭", async () => {
    upsert.mockRejectedValueOnce(new Error("boom"));
    const handleOpenChange = vi.fn();
    render(
      <AddProviderDialog open onOpenChange={handleOpenChange} appId="gemini" />,
    );

    await userEvent.click(screen.getByRole("button", { name: "save" }));

    await waitFor(() => expect(upsert).toHaveBeenCalledTimes(1));
    expect(sync).not.toHaveBeenCalled();
    expect(handleOpenChange).not.toHaveBeenCalled();
  });

  it("外层页脚提交按钮通过 form id 指向表单", () => {
    render(<AddProviderDialog open onOpenChange={vi.fn()} appId="claude" />);
    expect(lastSubmitFormId).toBe("universal-provider-form");
    const submit = screen.getByRole("button", { name: "common.add" });
    expect(submit).toHaveAttribute("form", "universal-provider-form");
  });

  it("每个应用都走同一条统一供应商路径", () => {
    for (const appId of [
      "claude",
      "claude-desktop",
      "codex",
      "gemini",
      "grokbuild",
    ] as const) {
      const { unmount } = render(
        <AddProviderDialog open onOpenChange={vi.fn()} appId={appId} />,
      );
      expect(screen.getByTestId("universal-form")).toBeInTheDocument();
      unmount();
    }
  });

  it("统一供应商预设覆盖全部五个应用", () => {
    expect(universalProviderPresets.length).toBeGreaterThan(0);
    for (const preset of universalProviderPresets) {
      expect(preset.defaultApps).toEqual({
        claude: true,
        codex: true,
        gemini: true,
        claudeDesktop: true,
        grokbuild: true,
      });
      expect(preset.defaultModels.claudeDesktop?.sonnetModel).toBeTruthy();
      expect(preset.defaultModels.grokbuild?.model).toBeTruthy();
    }
  });
});
