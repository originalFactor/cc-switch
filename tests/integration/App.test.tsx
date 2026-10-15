import { Suspense, type ComponentType } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  render,
  screen,
  waitFor,
  fireEvent,
  within,
} from "@testing-library/react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { universalProvidersApi } from "@/lib/api";
import type { useUnsavedChangesTracker as useUnsavedChangesTrackerType } from "@/lib/unsavedChanges";
import { resetProviderState } from "../msw/state";
import { emitTauriEvent } from "../msw/tauriMocks";

const toastSuccessMock = vi.fn();
const toastErrorMock = vi.fn();
const skillsPanelMocks = vi.hoisted(() => ({
  initialViews: [] as string[],
}));

vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccessMock(...args),
    error: (...args: unknown[]) => toastErrorMock(...args),
  },
}));

vi.mock("@/components/providers/ProviderList", () => ({
  ProviderList: ({
    providers,
    currentProviderId,
    onSwitch,
    onConfigureUsage,
    onOpenWebsite,
    onCreate,
    onDelete,
  }: any) => (
    <div>
      <div data-testid="provider-list">{JSON.stringify(providers)}</div>
      <div data-testid="current-provider">{currentProviderId}</div>
      <button onClick={() => onSwitch(providers[currentProviderId])}>
        switch
      </button>
      <button onClick={() => onConfigureUsage(providers[currentProviderId])}>
        usage
      </button>
      <button onClick={() => onOpenWebsite("https://example.com")}>
        open-website
      </button>
      <button onClick={() => onDelete(Object.values(providers)[0])}>
        delete
      </button>
      <button onClick={() => onCreate?.()}>create</button>
    </div>
  ),
}));

// 添加/编辑现在都用统一供应商表单。这里替身直接回一个统一供应商，
// 然后 upsert + sync，并按后端的行为发出 universal-provider-synced
// （App 靠这个事件刷新供应商列表）。
vi.mock("@/components/universal/UniversalProviderFormModal", () => ({
  UniversalProviderFormModal: ({ isOpen, onSave, onClose }: any) =>
    isOpen ? (
      <div data-testid="add-provider-dialog">
        <button
          onClick={() => {
            const provider = {
              id: "u-new",
              name: "New codex Provider",
              apps: {
                claude: true,
                codex: true,
                gemini: true,
                claudeDesktop: true,
                grokbuild: true,
              },
              baseUrl: "https://api.example.com",
              apiKey: "sk-new",
              models: {},
              createdAt: 1,
            };
            void (async () => {
              await universalProvidersApi.upsert(provider);
              await universalProvidersApi.sync(provider.id);
              emitTauriEvent("universal-provider-synced", { id: provider.id });
            })();
          }}
        >
          confirm-add
        </button>
        <button onClick={() => onClose?.()}>close-add</button>
        <button
          onClick={() =>
            onSave?.({
              id: "u-new",
              name: "New codex Provider",
              apps: {},
              baseUrl: "",
              apiKey: "",
              models: {},
            })
          }
        >
          save-direct
        </button>
      </div>
    ) : null,
}));

// 添加入口只走统一供应商：这里替身直接回一个统一供应商，
// 然后 upsert + sync，并按后端的行为发出 universal-provider-synced
// （App 靠这个事件刷新供应商列表）。

// 和真的用量面板一样登记改动（真的由 FullScreenPanel 的 trackUnsavedChanges 负责）
vi.mock("@/components/UsageScriptModal", async () => {
  const { useUnsavedChangesTracker } = await vi.importActual<{
    useUnsavedChangesTracker: typeof useUnsavedChangesTrackerType;
  }>("@/lib/unsavedChanges");
  const Body = ({
    provider,
    onSave,
    onClose,
  }: {
    provider?: { id?: string };
    onSave: (script: string) => void;
    onClose: () => void;
  }) => (
    <div data-testid="usage-modal" {...useUnsavedChangesTracker()}>
      <span data-testid="usage-provider">{provider?.id}</span>
      <input aria-label="usage-field" />
      <button onClick={() => onSave("script-code")}>save-script</button>
      <button onClick={() => onClose()}>close-usage</button>
    </div>
  );
  return {
    default: ({
      isOpen,
      ...props
    }: { isOpen?: boolean } & Parameters<typeof Body>[0]) =>
      isOpen ? <Body {...props} /> : null,
  };
});

vi.mock("@/components/ConfirmDialog", () => ({
  ConfirmDialog: ({ isOpen, message, onConfirm, onCancel }: any) =>
    isOpen ? (
      <div data-testid="confirm-dialog">
        <div data-testid="confirm-message">{message}</div>
        <button onClick={() => onConfirm()}>confirm-delete</button>
        <button onClick={() => onCancel()}>cancel-delete</button>
      </div>
    ) : null,
}));

vi.mock("@/contexts/UpdateContext", () => ({
  useUpdate: () => ({ hasUpdate: false, updateInfo: null }),
}));

// 设置页要 ThemeProvider，这里只看导航进去时发生了什么
vi.mock("@/components/settings/SettingsPage", () => ({
  SettingsPage: () => <div data-testid="settings-page" />,
}));

vi.mock("@/components/skills/UnifiedSkillsPanel", () => ({
  // v7：Skills 的页头（添加 / 检查更新 / 存储与同步）在面板自己里面
  default: ({ initialView }: { initialView?: string }) => {
    skillsPanelMocks.initialViews.push(initialView ?? "installed");
    return <div data-testid="unified-skills-panel">{initialView}</div>;
  },
}));

vi.mock("@/components/mcp/McpPanel", () => ({
  default: ({ open, onOpenChange }: any) =>
    open ? (
      <div data-testid="mcp-panel">
        <button onClick={() => onOpenChange(false)}>close-mcp</button>
      </div>
    ) : (
      <button onClick={() => onOpenChange(true)}>open-mcp</button>
    ),
}));

vi.mock("@/components/mcp/UnifiedMcpPanel", async () => {
  const { useUnsavedChangesTracker } = await vi.importActual<
    typeof import("@/lib/unsavedChanges")
  >("@/lib/unsavedChanges");
  // 当作一直开着的 MCP 编辑页：输入即登记未保存的修改
  const Body = () => (
    <div data-testid="mcp-editor" {...useUnsavedChangesTracker()}>
      <input aria-label="mcp-field" />
    </div>
  );
  return { default: Body };
});

/** 侧栏里的应用行（v7 侧栏取代了原来页头的应用切换器） */
const sidebarApp = (name: string) =>
  // 首次启动提示是模态对话框，会把侧栏标成 aria-hidden，所以带上 hidden
  within(document.querySelector("nav") as HTMLElement).getByRole("button", {
    name,
    hidden: true,
  });

const renderApp = (AppComponent: ComponentType) => {
  const client = new QueryClient();
  return render(
    <QueryClientProvider client={client}>
      <Suspense fallback={<div data-testid="loading">loading</div>}>
        <AppComponent />
      </Suspense>
    </QueryClientProvider>,
  );
};

describe("App integration with MSW", () => {
  beforeEach(() => {
    resetProviderState();
    toastSuccessMock.mockReset();
    toastErrorMock.mockReset();
    skillsPanelMocks.initialViews = [];
    localStorage.removeItem("cc-switch-last-view");
    localStorage.removeItem("cc-switch-last-app");
  });

  it("covers basic provider flows via real hooks", async () => {
    const { default: App } = await import("@/App");
    renderApp(App);

    await waitFor(() =>
      expect(screen.getByTestId("provider-list").textContent).toContain(
        "claude-1",
      ),
    );

    fireEvent.click(sidebarApp("Codex"));
    await waitFor(() =>
      expect(screen.getByTestId("provider-list").textContent).toContain(
        "codex-1",
      ),
    );

    fireEvent.click(screen.getByText("usage"));
    expect(screen.getByTestId("usage-modal")).toBeInTheDocument();
    fireEvent.click(screen.getByText("save-script"));
    fireEvent.click(screen.getByText("close-usage"));

    fireEvent.click(screen.getByText("create"));
    expect(screen.getByTestId("add-provider-dialog")).toBeInTheDocument();
    fireEvent.click(screen.getByText("confirm-add"));
    await waitFor(() =>
      expect(screen.getByTestId("provider-list").textContent).toMatch(
        /New codex Provider/,
      ),
    );

    fireEvent.click(screen.getByText("switch"));
    fireEvent.click(screen.getByText("open-website"));

    emitTauriEvent("provider-switched", {
      appType: "codex",
      providerId: "codex-2",
    });

    expect(toastErrorMock).not.toHaveBeenCalled();
    expect(toastSuccessMock).toHaveBeenCalled();
  }, 10_000);

  it("resets provider view scroll when switching apps", async () => {
    const { default: App } = await import("@/App");
    const { container } = renderApp(App);

    await waitFor(() =>
      expect(screen.getByTestId("provider-list").textContent).toContain(
        "claude-1",
      ),
    );

    const mainScrollContainer = container.querySelector("main") as HTMLElement;
    // 列表的滚动区在模式行下面（切换式应用每个应用一份）
    const providerScrollContainer = () =>
      container.querySelector<HTMLElement>("#main-content");

    expect(mainScrollContainer).not.toBeNull();
    expect(providerScrollContainer()).not.toBeNull();

    mainScrollContainer.scrollTop = 320;
    mainScrollContainer.scrollLeft = 12;
    providerScrollContainer()!.scrollTop = 640;
    providerScrollContainer()!.scrollLeft = 24;

    fireEvent.click(sidebarApp("Codex"));

    await waitFor(() =>
      expect(screen.getByTestId("provider-list").textContent).toContain(
        "codex-1",
      ),
    );

    expect(mainScrollContainer.scrollTop).toBe(0);
    expect(mainScrollContainer.scrollLeft).toBe(0);
    expect(providerScrollContainer()!.scrollTop).toBe(0);
    expect(providerScrollContainer()!.scrollLeft).toBe(0);
  }, 10_000);

  it("closes provider panels when navigating away from the app page", async () => {
    const { default: App } = await import("@/App");
    renderApp(App);

    await waitFor(() =>
      expect(screen.getByTestId("provider-list").textContent).toContain(
        "claude-1",
      ),
    );

    // 面板只盖住内容区，侧栏还能点：切应用时添加面板必须关掉，否则 Claude 的
    // 供应商会以 appId=codex 写进 Codex
    fireEvent.click(screen.getByText("usage"));
    expect(screen.getByTestId("usage-modal")).toBeInTheDocument();
    fireEvent.click(sidebarApp("nav.usage"));
    await waitFor(() =>
      expect(screen.queryByTestId("usage-modal")).not.toBeInTheDocument(),
    );

    fireEvent.click(sidebarApp("Codex"));
    await waitFor(() =>
      expect(screen.getByTestId("provider-list").textContent).toContain(
        "codex-1",
      ),
    );
    fireEvent.click(screen.getByText("create"));
    expect(screen.getByTestId("add-provider-dialog")).toBeInTheDocument();
    fireEvent.keyDown(window, { key: ",", metaKey: true });
    expect(await screen.findByTestId("settings-page")).toBeInTheDocument();
    expect(screen.queryByTestId("add-provider-dialog")).not.toBeInTheDocument();
  }, 10_000);

  it("asks before leaving an editor page with unsaved changes", async () => {
    const { default: App } = await import("@/App");
    renderApp(App);
    await waitFor(() =>
      expect(screen.getByTestId("provider-list").textContent).toContain(
        "claude-1",
      ),
    );

    // 没改过：照常离开，不问
    fireEvent.click(screen.getByText("usage"));
    fireEvent.click(sidebarApp("Codex"));
    await waitFor(() =>
      expect(screen.getByTestId("provider-list").textContent).toContain(
        "codex-1",
      ),
    );
    expect(screen.queryByTestId("confirm-dialog")).not.toBeInTheDocument();

    // 改过：先问；取消就留在原页
    // （ConfirmDialog 在这个文件里是 mock：只渲染消息和 confirm-delete / cancel-delete）
    fireEvent.click(screen.getByText("usage"));
    fireEvent.input(screen.getByLabelText("usage-field"), {
      target: { value: "draft" },
    });
    fireEvent.click(sidebarApp("Claude Code"));
    expect(await screen.findByTestId("confirm-message")).toHaveTextContent(
      "common.unsavedLeaveMessage",
    );
    fireEvent.click(screen.getByText("cancel-delete"));
    expect(screen.getByTestId("usage-modal")).toBeInTheDocument();
    expect(screen.getByTestId("provider-list").textContent).toContain(
      "codex-1",
    );

    // ⌘, 也问；放弃后才离开
    fireEvent.keyDown(window, { key: ",", metaKey: true });
    expect(await screen.findByTestId("confirm-message")).toHaveTextContent(
      "common.unsavedLeaveMessage",
    );
    fireEvent.click(screen.getByText("confirm-delete"));
    expect(await screen.findByTestId("settings-page")).toBeInTheDocument();
    expect(screen.queryByTestId("usage-modal")).not.toBeInTheDocument();
  }, 10_000);

  it("keeps the unsaved guard when re-clicking the current page", async () => {
    const { default: App } = await import("@/App");
    renderApp(App);
    await waitFor(() =>
      expect(screen.getByTestId("provider-list").textContent).toContain(
        "claude-1",
      ),
    );

    fireEvent.click(sidebarApp("MCP"));
    fireEvent.input(await screen.findByLabelText("mcp-field"), {
      target: { value: "draft" },
    });

    // 再点当前页：不离开，所以不问，也不能把未保存登记清掉
    fireEvent.click(sidebarApp("MCP"));
    expect(screen.queryByTestId("confirm-dialog")).not.toBeInTheDocument();
    expect(screen.getByTestId("mcp-editor")).toBeInTheDocument();

    // 之后真的离开时照样要问
    fireEvent.click(sidebarApp("nav.usage"));
    expect(await screen.findByTestId("confirm-message")).toHaveTextContent(
      "common.unsavedLeaveMessage",
    );
    fireEvent.click(screen.getByText("cancel-delete"));
    expect(screen.getByTestId("mcp-editor")).toBeInTheDocument();
  }, 10_000);

  it("shows toast when auto sync fails in background", async () => {
    const { default: App } = await import("@/App");
    renderApp(App);

    await waitFor(() =>
      expect(screen.getByTestId("provider-list").textContent).toContain(
        "claude-1",
      ),
    );

    expect(() => {
      emitTauriEvent("webdav-sync-status-updated", null);
    }).not.toThrow();
    expect(toastErrorMock).not.toHaveBeenCalled();

    emitTauriEvent("webdav-sync-status-updated", {
      source: "auto",
      status: "error",
      error: "network timeout",
    });

    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalled();
    });

    toastErrorMock.mockReset();
    expect(() => {
      emitTauriEvent("s3-sync-status-updated", null);
    }).not.toThrow();
    expect(toastErrorMock).not.toHaveBeenCalled();

    emitTauriEvent("s3-sync-status-updated", {
      source: "auto",
      status: "error",
      error: "s3 timeout",
    });

    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalled();
    });
  });

  it("renders the Skills page with its own header", async () => {
    localStorage.setItem("cc-switch-last-view", "skills");
    const { default: App } = await import("@/App");
    renderApp(App);

    expect(await screen.findByTestId("unified-skills-panel")).toHaveTextContent(
      "installed",
    );
  });

  it("opens the old skillsDiscovery view as the Discover segment", async () => {
    localStorage.setItem("cc-switch-last-view", "skillsDiscovery");
    const { default: App } = await import("@/App");
    renderApp(App);

    expect(await screen.findByTestId("unified-skills-panel")).toHaveTextContent(
      "discover",
    );
  });
});
