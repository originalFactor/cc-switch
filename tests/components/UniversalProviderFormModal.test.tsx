import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  UniversalProviderFormModal,
  type UniversalProviderFormModalProps,
} from "@/components/universal/UniversalProviderFormModal";
import type { UniversalProvider } from "@/types";

const FETCHED_MODELS = [
  {
    id: "claude-sonnet-5",
    displayName: "Claude Sonnet 5",
    contextWindow: 200000,
  },
  { id: "claude-opus-5", displayName: "Claude Opus 5", contextWindow: 200000 },
  {
    id: "claude-fable-4-20250514",
    displayName: "Fable",
    contextWindow: 200000,
  },
  {
    id: "claude-haiku-4-5",
    displayName: "Claude Haiku 4.5",
    contextWindow: 200000,
  },
  { id: "gpt-5.6-sol", displayName: "GPT-5.6 Sol", contextWindow: 1000000 },
  {
    id: "gemini-2.5-pro",
    displayName: "Gemini 2.5 Pro",
    contextWindow: 1000000,
  },
  { id: "grok-4.5", displayName: "Grok 4.5", contextWindow: 500000 },
  {
    id: "deepseek-v4-pro",
    displayName: "DeepSeek V4 Pro",
    contextWindow: 128000,
  },
];

const refreshModels = vi.fn();
vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    universalProvidersApi: {
      ...actual.universalProvidersApi,
      refreshModels: (...args: unknown[]) => refreshModels(...args),
    },
  };
});

vi.mock("@/components/JsonEditor", () => ({
  default: ({
    value,
    onChange,
  }: {
    value: string;
    onChange?: (value: string) => void;
  }) => (
    <textarea
      aria-label="json-editor"
      value={value}
      onChange={(event) => onChange?.(event.target.value)}
    />
  ),
}));

// 测试里的 i18n 资源是空的：带 defaultValue 的 t() 渲染 defaultValue，
// 没带的渲染 key 本身。这里按界面上真正出现的文案查询。
const LABEL = {
  name: "名称",
  baseUrl: "API 地址",
  apiKey: "API Key",
  add: "添加",
  changeIcon: "更换图标",
  iconSearch: "搜索图标",
  done: "完成",
  manageAndTest: "管理和测速",
  autoSelect: "endpointTest.autoSelect",
  cancel: "取消",
  saveAndSync: "保存并同步",
  oneMWindow: "1M 上下文窗口",
  remoteCompaction: "启用远程压缩",
  fetchModels: "获取模型列表",
  sonnet: "Sonnet",
  fable: "Fable",
} as const;

/** 从模型下拉里选一个模型（下拉里没有自由输入，必须走选项）。 */
const pickModel = async (
  user: ReturnType<typeof userEvent.setup>,
  fieldLabel: string,
  modelId: string,
) => {
  await user.click(screen.getByRole("combobox", { name: fieldLabel }));
  const option = await screen.findByRole("option", {
    name: new RegExp(modelId),
  });
  await user.click(option);
};

const renderModal = (props: Partial<UniversalProviderFormModalProps> = {}) => {
  const onSave = vi.fn();
  const onClose = vi.fn();
  const onSaveAndSync = vi.fn();
  render(
    <UniversalProviderFormModal
      isOpen
      onSave={onSave}
      onClose={onClose}
      onSaveAndSync={onSaveAndSync}
      {...props}
    />,
  );
  return { onSave, onClose, onSaveAndSync };
};

/**
 * 应用区块根节点：应用名 → 标题行 → 展开后的内容（含该应用的专属字段）。
 *
 * 区块默认收起：先点应用标题把它展开（内容里才有输入控件），再按标题文字找到
 * AppSection 的边框容器。配置预览也带一个同名的应用标题，所以取包含输入控件的
 * 那个；收起时内容根本不在 DOM 里，不会产生歧义。
 */
const appRow = (label: string) => {
  const header = screen
    .getAllByRole("button", { expanded: undefined })
    .find((button) => button.textContent?.includes(label));
  if (header && header.getAttribute("aria-expanded") === "false") {
    fireEvent.click(header);
  }
  return screen
    .getAllByText(label)
    .map((el) => el.closest<HTMLElement>("div.rounded-lg.border")!)
    .find((node) => node && node.querySelector("input, textarea"))!;
};

// Radix 的 Select 选项在 jsdom 里要求 scrollIntoView
beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: vi.fn(),
  });
});

const fillBasics = async (
  user: ReturnType<typeof userEvent.setup>,
  name = "My Gateway",
) => {
  // 新建模式会先填上预设名（NewAPI），这里换成自己的名字
  const nameInput = screen.getByLabelText(LABEL.name);
  await user.clear(nameInput);
  await user.type(nameInput, name);
  await user.type(
    screen.getByLabelText(LABEL.baseUrl),
    "https://api.example.com",
  );
  await user.type(screen.getByLabelText(LABEL.apiKey), "sk-test");
};

const editingProvider: UniversalProvider = {
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
  models: { claude: { model: "claude-sonnet-5" } },
  availableModels: [
    {
      id: "claude-sonnet-5",
      displayName: "Claude Sonnet 5",
      contextWindow: 200000,
    },
    { id: "gpt-5.6-sol", displayName: "GPT-5.6 Sol", contextWindow: 1000000 },
    { id: "gpt-5.6-mini", displayName: "GPT-5.6 Mini", contextWindow: 200000 },
    {
      id: "gemini-2.5-pro",
      displayName: "Gemini 2.5 Pro",
      contextWindow: 1000000,
    },
    { id: "grok-4.5", displayName: "Grok 4.5", contextWindow: 500000 },
    {
      id: "deepseek-v4-pro",
      displayName: "DeepSeek V4 Pro",
      contextWindow: 128000,
    },
    {
      id: "claude-opus-5",
      displayName: "Claude Opus 5",
      contextWindow: 200000,
    },
    {
      id: "claude-fable-4-20250514",
      displayName: "Fable",
      contextWindow: 200000,
    },
    {
      id: "claude-haiku-4-5",
      displayName: "Claude Haiku 4.5",
      contextWindow: 200000,
    },
  ],
  meta: {
    endpointAutoSelect: false,
    custom_endpoints: {
      "https://extra.example": {
        url: "https://extra.example",
        addedAt: 1,
      },
    },
  },
};

describe("UniversalProviderFormModal", () => {
  beforeEach(() => {
    refreshModels.mockReset();
    refreshModels.mockResolvedValue(FETCHED_MODELS);
  });

  it("新建时先拉取模型，再从可用列表里选", async () => {
    const user = userEvent.setup();
    refreshModels.mockResolvedValue(FETCHED_MODELS);
    const { onSave } = renderModal();

    await fillBasics(user);
    // 没拉之前下拉是禁用的（没有可选模型）
    const codex = appRow("OpenAI Codex");
    expect(
      within(codex).getByRole("combobox", { name: "模型" }),
    ).toBeDisabled();

    await user.click(screen.getByRole("button", { name: LABEL.fetchModels }));
    // 新建没有 id，用表单里填的地址和 Key 现拉
    expect(refreshModels).toHaveBeenCalledWith({
      baseUrl: "https://api.example.com",
      apiKey: "sk-test",
    });

    await user.click(within(codex).getByRole("combobox", { name: "模型" }));
    await user.click(
      await screen.findByRole("option", { name: /gpt-5\.6-sol/ }),
    );
    await user.click(screen.getByRole("button", { name: LABEL.add }));

    expect(onSave).toHaveBeenCalledTimes(1);
    const saved = onSave.mock.calls[0][0] as UniversalProvider;
    expect(saved.name).toBe("My Gateway");
    expect(saved.baseUrl).toBe("https://api.example.com");
    expect(saved.apiKey).toBe("sk-test");
    // 没有 per-app 开关了：一律同步到全部五个应用
    expect(saved.apps).toEqual({
      claude: true,
      codex: true,
      gemini: true,
      claudeDesktop: true,
      grokbuild: true,
    });
    expect(saved.models.codex?.model).toBe("gpt-5.6-sol");
    // 不再有预设：新建时名称、图标、模型都留空，只有用户填过的东西才写出去
    expect(saved.icon).toBeUndefined();
    expect(saved.iconColor).toBeUndefined();
    expect(saved.websiteUrl).toBeUndefined();
    expect(saved.models.gemini).toBeUndefined();
    expect(saved.meta?.endpointAutoSelect).toBe(true);
  });

  it("每个应用的高级选项和配置文件开关都进保存的 models", async () => {
    const user = userEvent.setup();
    const { onSave } = renderModal();

    await fillBasics(user);
    // 模型只能从下拉选，先拉一份可用列表（新建 → 用表单里的地址和 Key 现拉）
    await user.click(screen.getByRole("button", { name: LABEL.fetchModels }));

    // Claude：上游格式、User-Agent（1M 与显示名都按所选模型的元数据自动判定）
    const claude = appRow("Claude Code");
    // Fable 档从下拉里选（可用列表里给它一个值）
    await pickModel(user, "Fable", "claude-fable-4-20250514");
    await user.click(
      within(claude).getByRole("combobox", { name: "上游格式" }),
    );
    await user.click(await screen.findByRole("option", { name: "Responses" }));
    await user.type(
      within(claude).getByPlaceholderText("claude-cli/2.0.0"),
      "relay/1.0",
    );

    // Codex：压缩阈值、远程压缩（上下文窗口跟模型元数据，无输入框）
    const codex = appRow("OpenAI Codex");
    await user.click(
      within(codex).getByRole("checkbox", { name: LABEL.remoteCompaction }),
    );
    await user.type(within(codex).getByPlaceholderText("900000"), "800000");

    // Gemini：.env 块（JSON 里的花括号会被 user-event 当成按键描述符，直接改值）
    const gemini = appRow("Gemini CLI");
    const geminiEditors = within(gemini).getAllByLabelText("json-editor");
    fireEvent.change(geminiEditors[0], {
      target: { value: '{"GEMINI_CLI_CUSTOM_HEADERS": "X-A: 1"}' },
    });

    // Codex 的模型、子代理、请求覆盖。目录不再手填：后端按可用模型列表自动生成
    const codexCard = appRow("OpenAI Codex");
    await user.click(
      within(codexCard).getByRole("combobox", { name: "子代理模型" }),
    );
    await user.click(
      await screen.findByRole("option", { name: /gpt-5\.6-sol/ }),
    );
    await user.type(within(codexCard).getByPlaceholderText("low"), "medium");
    // 覆盖输入框按占位符挑：卡片尾部还有预览用的 textarea，不能按位置取
    const codexOverrides = within(codexCard)
      .getAllByRole("textbox")
      .filter((el) => el.getAttribute("placeholder")?.includes("X-Provider"));
    fireEvent.change(codexOverrides[0], {
      target: { value: '{"X-Provider": "cc-switch"}' },
    });

    // Claude Desktop：四档角色映射 + 上游格式（预设已填了 Sonnet 档，先清掉）
    const desktop = appRow("Claude Desktop");
    // 默认四档角色各有一个上游模型下拉，改第一档即可
    await user.click(
      within(desktop).getAllByRole("combobox", { name: "实际请求模型" })[0],
    );
    await user.click(
      await screen.findByRole("option", { name: /deepseek-v4-pro/ }),
    );
    await user.type(
      within(desktop).getAllByLabelText("菜单显示名")[0],
      "DeepSeek V4 Pro",
    );
    await user.click(
      within(desktop).getByRole("combobox", { name: "上游格式" }),
    );
    await user.click(
      await screen.findByRole("option", { name: /OpenAI Responses API/ }),
    );

    await user.click(screen.getByRole("button", { name: LABEL.add }));

    const saved = onSave.mock.calls[0][0] as UniversalProvider;
    // 1M 声明按所选模型的上下文窗口自动判定：claude-fable-4-20250514 只有
    // 200000，不声明；没选的档也一律不声明。
    expect(saved.models.claude?.sonnetModelOneM).toBeUndefined();
    expect(saved.models.claude?.fableModelOneM).toBeUndefined();
    expect(saved.models.claude?.modelOneM).toBeUndefined();
    expect(saved.models.claude?.fableModel).toBe("claude-fable-4-20250514");
    // 档位显示名跟随所选模型在可用列表里的显示名自动写入
    expect(saved.models.claude?.fableModelName).toBe("Fable");
    expect(saved.models.claude?.apiFormat).toBe("openai_responses");
    expect(saved.models.claude?.customUserAgent).toBe("relay/1.0");
    expect(saved.models.codex?.remoteCompaction).toBe(true);
    expect(saved.models.codex?.autoCompactLimit).toBe(800000);
    expect(saved.models.gemini?.env).toEqual({
      GEMINI_CLI_CUSTOM_HEADERS: "X-A: 1",
    });
    expect(saved.models.codex?.subagentModel).toBe("gpt-5.6-sol");
    expect(saved.models.codex?.subagentReasoningEffort).toBe("medium");
    // 目录不落进 models：后端拿 availableModels 自动生成（此处验证它没被表单写脏）
    expect(saved.models.codex?.catalogModels).toBeUndefined();
    // 拉到的模型列表随供应商一起保存，所有应用共用
    expect(saved.availableModels?.map((m) => m.id)).toContain("gpt-5.6-sol");
    expect(saved.models.codex?.requestOverrides?.headers).toEqual({
      "X-Provider": "cc-switch",
    });
    // Claude Desktop：接入方式、上游格式和四档角色路由都跟着保存
    expect(saved.models.claudeDesktop?.mode).toBe("proxy");
    expect(saved.models.claudeDesktop?.apiFormat).toBe("openai_responses");
    expect(saved.models.claudeDesktop?.routes?.["claude-sonnet-5"]).toEqual({
      model: "deepseek-v4-pro",
      labelOverride: "DeepSeek V4 Pro",
    });
    // 没填上游模型的档位不写：留着空模型会把后端的默认四档顶掉，整张表都是空模型。
    // 只有填了 Sonnet 一行，于是一个都没多写。
    expect(Object.keys(saved.models.claudeDesktop?.routes ?? {})).toEqual([
      "claude-sonnet-5",
    ]);
    // 这个用例覆盖五个应用的全部字段，交互次数远多于其他用例
  }, 20000);

  it("新增时就显示配置预览，五个开关都进保存的 models", async () => {
    const user = userEvent.setup();
    const { onSave } = renderModal();

    await fillBasics(user);
    const claude = appRow("Claude Code");

    // 新增模式下也要看得到配置预览，而且就长在这个应用的卡片里（JsonEditor 被 mock 成 textarea）
    const editors = within(claude).getAllByLabelText("json-editor");
    expect(
      editors.some((editor) =>
        (editor as HTMLTextAreaElement).value.includes(
          '"ANTHROPIC_BASE_URL": "https://api.example.com"',
        ),
      ),
    ).toBe(true);

    // 五个开关在同一行：三个上游兼容 + 署名 / 自动升级（都归这家供应商所有）
    await user.click(
      within(claude).getByRole("checkbox", { name: "启用 Tool Search" }),
    );
    await user.click(
      within(claude).getByRole("checkbox", { name: "禁用 Artifact 工具" }),
    );
    await user.click(
      within(claude).getByRole("checkbox", {
        name: "关闭 auto mode 服务端检查",
      }),
    );
    await user.click(
      within(claude).getByRole("checkbox", { name: "隐藏 AI 署名" }),
    );
    await user.click(
      within(claude).getByRole("checkbox", { name: "禁用自动升级" }),
    );

    await user.click(screen.getByRole("button", { name: LABEL.add }));

    const saved = onSave.mock.calls[0][0] as UniversalProvider;
    expect(saved.models.claude?.enableToolSearch).toBe(true);
    expect(saved.models.claude?.disableArtifact).toBe(true);
    expect(saved.models.claude?.disableAutoModeServer).toBe(true);
    expect(saved.models.claude?.hideAttribution).toBe(true);
    expect(saved.models.claude?.disableAutoUpgrade).toBe(true);
  }, 20000);

  it("图标选择器同时写入图标名和它的默认颜色", async () => {
    const user = userEvent.setup();
    const { onSave } = renderModal();

    await fillBasics(user);
    await user.click(screen.getByRole("button", { name: LABEL.changeIcon }));
    const picker = screen.getByRole("dialog");
    await user.type(within(picker).getByLabelText(LABEL.iconSearch), "gemini");
    // "gemini" 也是 Google 图标的关键字，按 title 精确挑那个按钮
    const geminiButton = within(picker)
      .getAllByRole("button")
      .find((button) => button.getAttribute("title") === "Gemini");
    expect(geminiButton).toBeDefined();
    await user.click(geminiButton!);
    await user.click(within(picker).getByRole("button", { name: LABEL.done }));
    await user.click(screen.getByRole("button", { name: LABEL.add }));

    const saved = onSave.mock.calls[0][0] as UniversalProvider;
    expect(saved.icon).toBe("gemini");
    expect(saved.iconColor).toBe("#4285F4");
  });

  it("编辑旧版扁平模型配置时迁移成角色路由", async () => {
    const user = userEvent.setup();
    // 4.0.8 及更早存的是扁平三档 + 共用菜单显示名
    const legacy: UniversalProvider = {
      ...editingProvider,
      apps: { ...editingProvider.apps, claudeDesktop: true },
      models: {
        claudeDesktop: {
          sonnetModel: "old-sonnet",
          opusModel: "old-opus",
          haikuModel: "old-haiku",
          labelOverride: "OldGateway",
          sonnetOneM: true,
        },
      },
    };
    const { onSaveAndSync } = renderModal({ editingProvider: legacy });

    const desktop = appRow("Claude Desktop");
    // 旧值出现在对应的角色行里，不是空白。上游模型现在是下拉：值在列表里没有时
    // 直接显示原始 id
    expect(
      within(desktop).getAllByRole("combobox", { name: "实际请求模型" })[0],
    ).toHaveTextContent("old-sonnet");
    expect(within(desktop).getAllByLabelText("菜单显示名")[0]).toHaveValue(
      "OldGateway",
    );

    await user.click(screen.getByRole("button", { name: LABEL.saveAndSync }));
    const confirm = screen.getByRole("dialog");
    await user.click(
      within(confirm).getByRole("button", { name: LABEL.saveAndSync }),
    );

    const saved = onSaveAndSync.mock.calls[0][0] as UniversalProvider;
    // 保存后只剩新形状：旧字段不再写回。1M 声明按可用列表的上下文窗口判定，
    // 旧值模型不在列表里 → 三档都不声明。
    expect(saved.models.claudeDesktop?.routes).toEqual({
      "claude-sonnet-5": {
        model: "old-sonnet",
        labelOverride: "OldGateway",
      },
      "claude-opus-5": { model: "old-opus", labelOverride: "OldGateway" },
      "claude-haiku-4-5": { model: "old-haiku", labelOverride: "OldGateway" },
    });
    expect(saved.models.claudeDesktop?.sonnetModel).toBeUndefined();
    expect(saved.models.claudeDesktop?.labelOverride).toBeUndefined();
  }, 20000);

  it("编辑时载入已存端点，保存并同步写回端点与自动选择开关", async () => {
    const user = userEvent.setup();
    const { onSaveAndSync } = renderModal({ editingProvider });

    await user.click(screen.getByRole("button", { name: LABEL.manageAndTest }));
    // 已存的自定义端点出现在测速面板里
    expect(
      await screen.findByText("https://extra.example"),
    ).toBeInTheDocument();
    const autoSelect = screen.getByRole("checkbox", {
      name: LABEL.autoSelect,
    });
    expect(autoSelect).not.toBeChecked();
    await user.click(autoSelect);
    await user.click(screen.getByRole("button", { name: LABEL.cancel }));

    await user.click(screen.getByRole("button", { name: LABEL.saveAndSync }));
    const confirm = screen.getByRole("dialog");
    await user.click(
      within(confirm).getByRole("button", { name: LABEL.saveAndSync }),
    );

    expect(onSaveAndSync).toHaveBeenCalledTimes(1);
    const saved = onSaveAndSync.mock.calls[0][0] as UniversalProvider;
    expect(saved.meta?.endpointAutoSelect).toBe(true);
    expect(Object.keys(saved.meta?.custom_endpoints ?? {})).toEqual([
      "https://extra.example",
    ]);
    // 去掉 app 开关后，保存也一律把五个应用标为启用
    expect(saved.apps).toEqual({
      claude: true,
      codex: true,
      gemini: true,
      claudeDesktop: true,
      grokbuild: true,
    });
  });
});
