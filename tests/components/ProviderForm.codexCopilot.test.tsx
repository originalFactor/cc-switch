import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  ProviderForm,
  type ProviderFormProps,
  type ProviderFormValues,
} from "@/components/providers/forms/ProviderForm";
import type { CodexCopilotApiFormat, ProviderMeta } from "@/types";
import { createTestQueryClient } from "../utils/testQueryClient";

const copilotAuthState = vi.hoisted(() => ({
  isAuthenticated: true,
  isStatusSuccess: true,
  isStatusError: false,
}));
const toastError = vi.hoisted(() => vi.fn());

vi.mock("sonner", () => ({
  toast: { error: toastError, success: vi.fn() },
}));

vi.mock("@/components/providers/forms/CopilotAuthSection", () => ({
  CopilotAuthSection: ({
    selectedAccountId,
    onAccountSelect,
  }: {
    selectedAccountId?: string | null;
    onAccountSelect?: (accountId: string | null) => void;
  }) => (
    <>
      <output data-testid="selected-copilot-account">
        {selectedAccountId ?? "default"}
      </output>
      <button
        type="button"
        onClick={() => onAccountSelect?.("copilot-account")}
      >
        select-copilot-account
      </button>
    </>
  ),
}));
vi.mock("@/components/JsonEditor", () => ({
  default: ({
    value,
    onChange,
  }: {
    value: string;
    onChange: (value: string) => void;
  }) => (
    <textarea
      data-testid="json-editor"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  ),
}));
vi.mock("@/components/providers/forms/hooks", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/components/providers/forms/hooks")>();
  return {
    ...actual,
    useCopilotAuth: () => ({
      ...copilotAuthState,
      defaultAccountId: "copilot-account",
      accounts: [
        {
          id: "copilot-account",
          login: "copilot-user",
          is_default: true,
        },
        {
          id: "copilot-secondary",
          login: "copilot-secondary-user",
          is_default: false,
        },
      ],
    }),
    useCodexOauth: () => ({ isAuthenticated: false, accounts: [] }),
    useXaiOauth: () => ({ isAuthenticated: false, accounts: [] }),
  };
});

/**
 * GitHub Copilot 型供应商的行：预设体系移除后，这类供应商由用户自己添加（API Key +
 * 模型映射）或在列表里编辑，所以用例一律用 initialData 走编辑路径。
 */
const COPILOT_CONFIG = `model_provider = "custom"
model = "gpt-6-astra"
model_reasoning_effort = "high"

[model_providers.custom]
name = "GitHub Copilot"
base_url = "https://api.githubcopilot.com"
wire_api = "responses"
requires_openai_auth = true`;

const COPILOT_MODEL_CATALOG = [
  { model: "gpt-6-astra", contextWindow: 272000 },
  { model: "gpt-5.6-sol", contextWindow: 272000 },
  { model: "gpt-5.6-terra", contextWindow: 272000 },
  { model: "gpt-5.6-luna", contextWindow: 272000 },
  { model: "gpt-5.5", contextWindow: 200000 },
];

function renderForm(
  meta?: ProviderMeta,
  onEditorBaseChange?: ProviderFormProps["onEditorBaseChange"],
  overrides: Partial<Parameters<typeof ProviderForm>[0]> = {},
) {
  const onSubmit = vi.fn<(values: ProviderFormValues) => void>();
  render(
    <QueryClientProvider client={createTestQueryClient()}>
      <ProviderForm
        appId="codex"
        submitLabel="save"
        onSubmit={onSubmit}
        onCancel={vi.fn()}
        onEditorBaseChange={onEditorBaseChange}
        initialData={
          meta
            ? {
                name: "GitHub Copilot",
                category: "third_party",
                settingsConfig: {
                  auth: {},
                  config: COPILOT_CONFIG,
                  modelCatalog: { models: COPILOT_MODEL_CATALOG },
                },
                meta,
              }
            : undefined
        }
        {...overrides}
      />
    </QueryClientProvider>,
  );
  return onSubmit;
}

function formatControl() {
  return screen.getByRole("combobox", { name: "上游格式" });
}

const formatLabels = {
  auto: "codexConfig.upstreamFormatAuto",
  openai_chat: "Chat Completions（需开启路由）",
  openai_responses: "codexConfig.upstreamFormatCopilotResponses",
};

async function selectFormat(format: CodexCopilotApiFormat) {
  fireEvent.keyDown(formatControl(), { key: "ArrowDown" });
  fireEvent.click(
    await screen.findByRole("option", { name: formatLabels[format] }),
  );
}

const copilotMeta: ProviderMeta = {
  providerType: "github_copilot",
  apiFormat: "openai_responses",
};

describe("Codex Copilot provider form", () => {
  beforeEach(() => {
    copilotAuthState.isAuthenticated = true;
    copilotAuthState.isStatusSuccess = true;
    copilotAuthState.isStatusError = false;
    toastError.mockReset();
  });

  const scrollIntoViewDescriptor = Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    "scrollIntoView",
  );
  beforeAll(() => {
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: vi.fn(),
    });
  });
  afterAll(() => {
    if (scrollIntoViewDescriptor) {
      Object.defineProperty(
        HTMLElement.prototype,
        "scrollIntoView",
        scrollIntoViewDescriptor,
      );
    } else {
      Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
    }
  });

  it("shows the stored model mappings and keeps the client wire protocol", () => {
    renderForm(copilotMeta);
    expect(screen.getAllByDisplayValue("gpt-6-astra")).toHaveLength(2);
    for (const model of ["gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna", "gpt-5.5"]) {
      expect(screen.getByDisplayValue(model)).toBeVisible();
    }
    expect(screen.getAllByDisplayValue("272000")).toHaveLength(4);
    expect(screen.getByDisplayValue("200000")).toBeVisible();
    expect(formatControl()).toHaveTextContent(formatLabels.auto);
    expect(screen.getByText("模型映射")).toBeVisible();
  });

  it.each<CodexCopilotApiFormat>(["auto", "openai_chat", "openai_responses"])(
    "persists %s without changing the Codex client wire protocol",
    async (format) => {
      const onSubmit = renderForm(copilotMeta);
      await selectFormat(format);
      expect(screen.getByText("模型映射")).toBeVisible();
      fireEvent.click(screen.getByRole("button", { name: "save" }));
      await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
      const saved = onSubmit.mock.calls[0][0];
      expect(saved.meta?.codexCopilotApiFormat).toBe(
        format === "auto" ? undefined : format,
      );
      expect(JSON.parse(saved.settingsConfig).config).toContain(
        'wire_api = "responses"',
      );
      expect(JSON.parse(saved.settingsConfig).modelCatalog.models).toEqual(
        COPILOT_MODEL_CATALOG,
      );
    },
  );

  it("preserves account, protocol and model edits when saving a Copilot card", async () => {
    const onEditorBaseChange = vi.fn();
    const onSubmit = renderForm(
      { ...copilotMeta, codexCopilotApiFormat: "openai_responses" },
      onEditorBaseChange,
    );
    // 编辑已有卡片：编辑框读的是行里存的内容（透传到 live 投影由后端负责），
    // 不上报新增草稿的底。
    expect(onEditorBaseChange).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(
        screen
          .getAllByTestId("json-editor")
          .map((node) => (node as HTMLTextAreaElement).value),
      ).toContain(COPILOT_CONFIG),
    );

    fireEvent.click(
      screen.getByRole("button", { name: "select-copilot-account" }),
    );
    await selectFormat("openai_responses");
    fireEvent.change(screen.getByLabelText("默认模型"), {
      target: { value: "gpt-5.6-luna" },
    });
    fireEvent.change(screen.getByDisplayValue("gpt-5.6-sol"), {
      target: { value: "custom-copilot-model" },
    });
    fireEvent.change(screen.getAllByDisplayValue("272000")[0], {
      target: { value: "524288" },
    });
    fireEvent.click(screen.getByRole("button", { name: "save" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const saved = onSubmit.mock.calls[0][0];
    expect(saved.meta).toEqual(
      expect.objectContaining({
        providerType: "github_copilot",
        authBinding: {
          source: "managed_account",
          authProvider: "github_copilot",
          accountId: "copilot-account",
        },
        githubAccountId: "copilot-account",
        codexCopilotApiFormat: "openai_responses",
      }),
    );
    const settings = JSON.parse(saved.settingsConfig);
    expect(settings.auth).toEqual({});
    expect(settings.config).toContain('model = "gpt-5.6-luna"');
    expect(settings.config).toContain('wire_api = "responses"');
    expect(settings.modelCatalog.models).toEqual(
      COPILOT_MODEL_CATALOG.map((model) =>
        model.model === "gpt-6-astra"
          ? { ...model, contextWindow: 524288 }
          : model.model === "gpt-5.6-sol"
            ? { ...model, model: "custom-copilot-model" }
            : model,
      ),
    );
    // 编辑路径不携带新增草稿的 editorSave
    expect(saved).not.toHaveProperty("editorSave");
    expect(screen.queryByText("仍要保存")).not.toBeInTheDocument();
  });

  it.each<{ name: string; meta: ProviderMeta; accountId: string | null }>([
    {
      name: "a non-default managed account",
      meta: {
        authBinding: {
          source: "managed_account",
          authProvider: "github_copilot",
          accountId: "copilot-secondary",
        },
      },
      accountId: "copilot-secondary",
    },
    {
      name: "a legacy GitHub account binding",
      meta: { githubAccountId: "copilot-secondary" },
      accountId: "copilot-secondary",
    },
    {
      name: "a managed binding ahead of a conflicting legacy account",
      meta: {
        authBinding: {
          source: "managed_account",
          authProvider: "github_copilot",
          accountId: "copilot-secondary",
        },
        githubAccountId: "copilot-account",
      },
      accountId: "copilot-secondary",
    },
    {
      name: "an explicit default binding ahead of a stale legacy account",
      meta: {
        authBinding: {
          source: "managed_account",
          authProvider: "github_copilot",
        },
        githubAccountId: "copilot-secondary",
      },
      accountId: null,
    },
  ])("preserves $name when editing and saving", async ({ meta, accountId }) => {
    const onSubmit = renderForm({
      ...meta,
      providerType: "github_copilot",
      apiFormat: "openai_responses",
      codexCopilotApiFormat: "openai_responses",
    });
    expect(screen.getByTestId("selected-copilot-account")).toHaveTextContent(
      accountId ?? "default",
    );
    fireEvent.change(screen.getByLabelText("默认模型"), {
      target: { value: "gpt-5.6-luna" },
    });
    fireEvent.click(screen.getByRole("button", { name: "save" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const saved = onSubmit.mock.calls[0][0];
    expect(saved.meta?.authBinding).toEqual({
      source: "managed_account",
      authProvider: "github_copilot",
      ...(accountId ? { accountId } : {}),
    });
    expect(saved.meta?.githubAccountId).toBe(accountId ?? undefined);
    expect(saved.meta?.providerType).toBe("github_copilot");
    expect(saved.meta?.codexCopilotApiFormat).toBe("openai_responses");
    const settings = JSON.parse(saved.settingsConfig);
    expect(settings.auth).toEqual({});
    expect(settings.config).toContain('wire_api = "responses"');
    expect(settings.config).toContain('model = "gpt-5.6-luna"');
  });

  it.each([
    {
      name: "loading",
      isStatusError: false,
      message: "正在加载 GitHub Copilot 账号状态，请稍后再试。",
    },
    {
      name: "failed",
      isStatusError: true,
      message: "无法加载 GitHub Copilot 账号状态，请重试。",
    },
  ])("blocks saving while account status is $name", async (status) => {
    copilotAuthState.isStatusSuccess = false;
    copilotAuthState.isStatusError = status.isStatusError;
    const onSubmit = renderForm({
      providerType: "github_copilot",
      githubAccountId: "copilot-secondary",
    });
    fireEvent.click(screen.getByRole("button", { name: "save" }));

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(status.message),
    );
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByTestId("selected-copilot-account")).toHaveTextContent(
      "copilot-secondary",
    );
  });

  // The mocked section retains the ID so this exercises only the form's guard,
  // not the real account selector's cleanup when an account disappears.
  it("blocks submission while the form still holds an unavailable account ID", async () => {
    const onSubmit = renderForm({
      providerType: "github_copilot",
      authBinding: {
        source: "managed_account",
        authProvider: "github_copilot",
        accountId: "copilot-deleted",
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "save" }));

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(
        "已绑定账号不存在，请重新选择账号",
      ),
    );
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("blocks saving when the managed account is signed out", async () => {
    copilotAuthState.isAuthenticated = false;
    const onSubmit = renderForm({
      providerType: "github_copilot",
      githubAccountId: "copilot-account",
    });
    fireEvent.click(screen.getByRole("button", { name: "save" }));

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith("请先登录 GitHub Copilot"),
    );
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
