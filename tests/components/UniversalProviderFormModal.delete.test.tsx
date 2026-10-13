import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { UniversalProviderFormModal } from "@/components/universal/UniversalProviderFormModal";
import type { UniversalProvider } from "@/types";

vi.mock("@/components/JsonEditor", () => ({
  default: ({ value }: { value: string }) => (
    <textarea aria-label="json-editor" value={value} readOnly />
  ),
}));

const provider: UniversalProvider = {
  id: "u1",
  name: "Existing",
  baseUrl: "https://old.example.com",
  apiKey: "sk-old",
  apps: {
    claude: true,
    codex: false,
    gemini: false,
    claudeDesktop: false,
    grokbuild: false,
  },
  models: {},
};

describe("UniversalProviderFormModal — 删除入口", () => {
  beforeAll(() => {
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: vi.fn(),
    });
  });

  it("编辑时显示「删除」，点击回传这家供应商", async () => {
    const onDelete = vi.fn();
    render(
      <UniversalProviderFormModal
        isOpen
        editingProvider={provider}
        onSave={vi.fn()}
        onDelete={onDelete}
        onClose={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /删除/ }));
    expect(onDelete).toHaveBeenCalledWith(provider);
  });

  it("新建时不显示「删除」", () => {
    render(
      <UniversalProviderFormModal
        isOpen
        onSave={vi.fn()}
        onDelete={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.queryByRole("button", { name: /^删除$/ })).toBeNull();
  });

  it("没有传 onDelete 时不显示「删除」", () => {
    render(
      <UniversalProviderFormModal
        isOpen
        editingProvider={provider}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.queryByRole("button", { name: /^删除$/ })).toBeNull();
  });

  it("页脚始终自带提交按钮（不再依赖外层 form id）", () => {
    render(
      <UniversalProviderFormModal
        isOpen
        editingProvider={provider}
        onSave={vi.fn()}
        onSaveAndSync={vi.fn()}
        onDelete={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("button", { name: /保存并同步/ }),
    ).toBeInTheDocument();
  });
});
