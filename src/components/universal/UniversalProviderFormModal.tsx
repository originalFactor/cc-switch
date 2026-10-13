import type * as React from "react";
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useDarkMode } from "@/hooks/useDarkMode";
import { useTranslation } from "react-i18next";
import {
  ArrowLeft,
  Eye,
  EyeOff,
  RefreshCw,
  Trash2,
  X,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { HoverTip } from "@/components/ui/hover-tip";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FullScreenPanel } from "@/components/common/FullScreenPanel";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { ProviderIcon } from "@/components/ProviderIcon";
import { ProviderIconBox } from "@/components/ProviderIconBox";
import { IconPicker } from "@/components/IconPicker";
import { getIconMetadata } from "@/icons/extracted/metadata";
import EndpointSpeedTest from "@/components/providers/forms/EndpointSpeedTest";
import JsonEditor from "@/components/JsonEditor";
import { ModelSelect } from "./ModelSelect";
import { AvailableModelsEditor } from "./AvailableModelsEditor";
import { universalProvidersApi } from "@/lib/api";
import { toast } from "@/lib/toast";
import { extractErrorMessage } from "@/utils/errorUtils";
import type {
  ClaudeDesktopMode,
  ClaudeDesktopModelConfig,
  ClaudeDesktopModelRoute,
  GeminiModelConfig,
  LocalProxyRequestOverrides,
  ProviderMeta,
  AvailableModel,
  UniversalProvider,
  UniversalProviderModels,
} from "@/types";

export interface UniversalProviderFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (provider: UniversalProvider) => void;
  onSaveAndSync?: (provider: UniversalProvider) => void;
  editingProvider?: UniversalProvider | null;
  /**
   * 编辑时的删除动作。传了才显示「删除」：新建没有可删的东西。
   *
   * 页脚由本表单自己管（外层全屏面板盖住它那层的页脚，按钮点不到），所以删除放在
   * 这里而不是列表卡片上。
   */
  onDelete?: (provider: UniversalProvider) => void;
  /** 面板副标题：添加页会把当前应用拼进去。 */
  subtitle?: string;
  /** 页头右上角的动作（添加页的「管理」）。 */
  manageAction?: React.ReactNode;
}

const EMPTY_OVERRIDES = { headers: "", body: "" };

/** Claude Desktop 的角色档位，与后端 DEFAULT_PROXY_ROUTES / 单应用表单同 id。 */
const DESKTOP_ROLE_ROUTES: { id: string; label: string }[] = [
  { id: "claude-sonnet-5", label: "Sonnet" },
  { id: "claude-opus-5", label: "Opus" },
  { id: "claude-fable-5", label: "Fable" },
  { id: "claude-haiku-4-5", label: "Haiku" },
];

type DesktopRouteRow = {
  routeId: string;
  model: string;
  labelOverride: string;
  supports1m: boolean;
};

/** 默认四档（模型映射模式）：档位固定，上游模型留空由用户填。 */
const defaultDesktopRouteRows = (): DesktopRouteRow[] =>
  DESKTOP_ROLE_ROUTES.map(({ id }) => ({
    routeId: id,
    model: "",
    labelOverride: "",
    supports1m: false,
  }));

/** 预设/已存的路由表 → 可编辑行；没有就用固定四档。 */
const desktopRowsOrDefault = (
  config: ClaudeDesktopModelConfig | undefined,
): DesktopRouteRow[] => {
  const rows = desktopRouteRowsFrom(desktopRoutesOf(config));
  return rows.length > 0 ? rows : defaultDesktopRouteRows();
};

/**
 * 取路由表。新形状优先；旧版（4.0.8 及更早）只存了三个扁平档位和共用的菜单显示名，
 * 这里迁移成三档角色路由，编辑老供应商时不会看起来「什么都没配」。
 */
const desktopRoutesOf = (
  config: ClaudeDesktopModelConfig | undefined,
): Record<string, ClaudeDesktopModelRoute> | undefined => {
  if (!config) return undefined;
  if (config.routes && Object.keys(config.routes).length > 0) {
    return config.routes;
  }
  const label = config.labelOverride?.trim() || undefined;
  const legacy: Record<string, ClaudeDesktopModelRoute> = {};
  const add = (routeId: string, model?: string, oneM?: boolean) => {
    if (!model?.trim()) return;
    legacy[routeId] = {
      model: model.trim(),
      ...(label ? { labelOverride: label } : {}),
      ...(oneM ? { supports1m: true } : {}),
    };
  };
  add("claude-sonnet-5", config.sonnetModel, config.sonnetOneM);
  add("claude-opus-5", config.opusModel, config.opusOneM);
  add("claude-haiku-4-5", config.haikuModel, config.haikuOneM);
  return Object.keys(legacy).length > 0 ? legacy : undefined;
};

/** 把存下来的路由表还原成可编辑的行。 */
const desktopRouteRowsFrom = (
  routes: Record<string, ClaudeDesktopModelRoute> | undefined,
): DesktopRouteRow[] =>
  Object.entries(routes ?? {}).map(([routeId, route]) => ({
    routeId,
    model: route.model ?? "",
    labelOverride: route.labelOverride ?? "",
    supports1m: route.supports1m === true,
  }));

/**
 * 角色档位的显示名。模型映射模式下档位就是固定的四个角色；直连模式的 route 是
 * 用户自己填的模型名，原样显示。
 */
const desktopRoleLabel = (routeId: string) =>
  DESKTOP_ROLE_ROUTES.find(({ id }) => id === routeId)?.label ?? routeId;

/** 把存下来的请求覆盖还原成两个文本框里的文本 */
const overridesToText = (
  models: { requestOverrides?: LocalProxyRequestOverrides } | undefined,
): { headers: string; body: string } => ({
  headers: models?.requestOverrides?.headers
    ? JSON.stringify(models.requestOverrides.headers, null, 2)
    : "",
  body: models?.requestOverrides?.body
    ? JSON.stringify(models.requestOverrides.body, null, 2)
    : "",
});

export function UniversalProviderFormModal({
  isOpen,
  onClose,
  onSave,
  onSaveAndSync,
  editingProvider,
  onDelete,
  subtitle,
  manageAction,
}: UniversalProviderFormModalProps) {
  const isDarkMode = useDarkMode();
  const { t } = useTranslation();
  const isEditMode = !!editingProvider;

  // 表单状态
  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [notes, setNotes] = useState("");

  const [icon, setIcon] = useState("");
  const [iconColor, setIconColor] = useState("");
  const [iconDialogOpen, setIconDialogOpen] = useState(false);
  const [isEndpointModalOpen, setIsEndpointModalOpen] = useState(false);
  const [endpointAutoSelect, setEndpointAutoSelect] = useState(true);
  const [draftCustomEndpoints, setDraftCustomEndpoints] = useState<string[]>(
    [],
  );
  // Gemini 的 .env / settings.json 块：输入过程中大多不是合法 JSON，所以按文本保存，
  // 只有保存时才解析（和单应用表单把编辑器内容镜像成本地状态是同一个道理）。
  const [geminiEnvText, setGeminiEnvText] = useState("{}");
  const [geminiConfigText, setGeminiConfigText] = useState("{}");
  // Claude / Codex 的本地代理请求覆盖同样是「按文本输入、保存时解析」。
  const [claudeOverrides, setClaudeOverrides] = useState({
    headers: "",
    body: "",
  });
  // Claude Code 的两个全局开关：对所有供应商生效，写进 live 而不是供应商行。
  // 只在用户这次真的动过开关时才写出去：否则「打开编辑器再保存」会把别处设好的
  // 全局值清掉。
  const [claudeHideAttribution, setClaudeHideAttribution] = useState(false);
  const [claudeDisableAutoUpgrade, setClaudeDisableAutoUpgrade] =
    useState(false);
  const claudeGlobalsTouched = useRef({
    hideAttribution: false,
    disableAutoUpgrade: false,
  });
  const [codexOverrides, setCodexOverrides] = useState({
    headers: "",
    body: "",
  });

  // 模型配置
  const [models, setModels] = useState<UniversalProviderModels>({});
  /** 从 `/v1/models` 拉到的可用模型列表（models.dev 补全过）；所有应用共用。 */
  const [availableModels, setAvailableModels] = useState<AvailableModel[]>([]);
  /** 上次拉取的结果，用于「恢复」：用户手改过之后还能还原。 */
  const [fetchedModels, setFetchedModels] = useState<AvailableModel[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);

  // Claude Desktop：接入方式和路由表单独放，切换接入方式时清空重填
  const [desktopMode, setDesktopMode] = useState<ClaudeDesktopMode>("proxy");
  const [desktopRoutes, setDesktopRoutes] = useState<DesktopRouteRow[]>([]);

  // 保存并同步确认弹窗
  const [syncConfirmOpen, setSyncConfirmOpen] = useState(false);
  const [pendingProvider, setPendingProvider] =
    useState<UniversalProvider | null>(null);

  // 初始化表单
  useEffect(() => {
    if (editingProvider) {
      // 编辑模式：加载现有数据
      setName(editingProvider.name);
      setBaseUrl(editingProvider.baseUrl);
      setApiKey(editingProvider.apiKey);
      setWebsiteUrl(editingProvider.websiteUrl || "");
      setNotes(editingProvider.notes || "");
      setIcon(editingProvider.icon || "");
      setIconColor(editingProvider.iconColor || "");
      setDesktopMode(editingProvider.models?.claudeDesktop?.mode ?? "proxy");
      setDesktopRoutes(
        desktopRowsOrDefault(editingProvider.models?.claudeDesktop),
      );
      setModels(editingProvider.models || {});
      setGeminiEnvText(
        JSON.stringify(editingProvider.models?.gemini?.env ?? {}, null, 2),
      );
      setGeminiConfigText(
        JSON.stringify(editingProvider.models?.gemini?.config ?? {}, null, 2),
      );
      setClaudeOverrides(overridesToText(editingProvider.models?.claude));
      setClaudeHideAttribution(
        editingProvider.models?.claude?.hideAttribution === true,
      );
      claudeGlobalsTouched.current = {
        hideAttribution: false,
        disableAutoUpgrade: false,
      };
      setClaudeDisableAutoUpgrade(
        editingProvider.models?.claude?.disableAutoUpgrade === true,
      );
      setCodexOverrides(overridesToText(editingProvider.models?.codex));
      setDraftCustomEndpoints(
        Object.keys(editingProvider.meta?.custom_endpoints ?? {}),
      );
      setEndpointAutoSelect(editingProvider.meta?.endpointAutoSelect ?? true);
      setAvailableModels(editingProvider.availableModels ?? []);
      setFetchedModels(editingProvider.availableModels ?? []);
    } else {
      // 新建模式：留空表单，由用户自己填。不再有预设，也就没有预填的模型和类型；
      // 五个应用默认全开，模型留空时后端用各应用的默认值。
      setName("");
      setNotes("");
      setIcon("");
      setIconColor("");
      setApiKey("");
      setWebsiteUrl("");
      setModels({});
      setDesktopMode("proxy");
      setDesktopRoutes(desktopRowsOrDefault(undefined));
      setGeminiEnvText("{}");
      setGeminiConfigText("{}");
      setClaudeOverrides(EMPTY_OVERRIDES);
      setClaudeHideAttribution(false);
      claudeGlobalsTouched.current = {
        hideAttribution: false,
        disableAutoUpgrade: false,
      };
      setClaudeDisableAutoUpgrade(false);
      setCodexOverrides(EMPTY_OVERRIDES);
      setDraftCustomEndpoints([]);
      setEndpointAutoSelect(true);
      setAvailableModels([]);
      setFetchedModels([]);
    }
  }, [editingProvider, isOpen]);

  // 选择图标：同时带上图标自带的默认颜色（和单应用供应商表单一致）
  const handleIconSelect = useCallback((nextIcon: string) => {
    const meta = getIconMetadata(nextIcon);
    setIcon(nextIcon);
    setIconColor(meta?.defaultColor ?? "");
  }, []);

  // 更新某个应用的配置。值可以是字符串（文本框）、布尔（勾选）或数字（阈值），
  // 空字符串和未勾选都表示「没配」，清掉这个键而不是留个空值。
  const updateModel = useCallback(
    (
      app: "claude" | "codex" | "gemini" | "claudeDesktop" | "grokbuild",
      field: string,
      value: string | boolean | number,
    ) => {
      setModels((prev) => {
        const next = { ...(prev[app] || {}) } as Record<string, unknown>;
        const cleared =
          value === "" ||
          value === false ||
          (typeof value === "number" && Number.isNaN(value));
        if (cleared) {
          delete next[field];
        } else {
          next[field] =
            typeof value === "string" && /^\d+$/.test(value)
              ? Number(value)
              : value;
        }
        return { ...prev, [app]: next };
      });
    },
    [],
  );

  // Claude Desktop 的路由行：改哪一行就只动那一行。
  const updateDesktopRoute = useCallback(
    (index: number, patch: Partial<DesktopRouteRow>) => {
      setDesktopRoutes((prev) =>
        prev.map((row, i) => (i === index ? { ...row, ...patch } : row)),
      );
    },
    [],
  );

  // 思考能力：只有勾上的项才写，两个都关掉时整块清掉。
  const updateChatReasoning = useCallback(
    (field: "supportsThinking" | "supportsEffort", checked: boolean) => {
      setModels((prev) => {
        const current = { ...(prev.codex?.chatReasoning ?? {}) };
        if (checked) {
          current[field] = true;
          // 和单应用表单一样的默认参数名
          if (field === "supportsThinking" && !current.thinkingParam) {
            current.thinkingParam = "thinking";
          }
          if (field === "supportsEffort") {
            current.effortParam ??= "reasoning_effort";
            current.effortValueMode ??= "passthrough";
            current.outputFormat ??= "auto";
          }
        } else {
          delete current[field];
        }
        const next = { ...(prev.codex ?? {}) };
        if (Object.keys(current).length > 0) {
          next.chatReasoning = current;
        } else {
          delete next.chatReasoning;
        }
        return { ...prev, codex: next };
      });
    },
    [],
  );

  // 计算 Claude 配置 JSON 预览
  const claudeConfigJson = useMemo(() => {
    const m = models.claude ?? {};
    const withOneM = (value: string | undefined, flag: boolean | undefined) =>
      value && flag ? `${value.trimEnd()}[1M]` : value;
    const model = m.model || "claude-sonnet-4-20250514";
    const haiku = m.haikuModel || "claude-haiku-4-20250514";
    const sonnet = m.sonnetModel || "claude-sonnet-4-20250514";
    const opus = m.opusModel || "claude-opus-4-20250514";
    const fable = m.fableModel || "claude-fable-4-20250514";
    const env: Record<string, string> = {
      ANTHROPIC_BASE_URL: baseUrl,
      [m.apiKeyField === "ANTHROPIC_API_KEY"
        ? "ANTHROPIC_API_KEY"
        : "ANTHROPIC_AUTH_TOKEN"]: apiKey,
      ANTHROPIC_MODEL: withOneM(model, m.modelOneM)!,
      ANTHROPIC_DEFAULT_HAIKU_MODEL: withOneM(haiku, m.haikuModelOneM)!,
      ANTHROPIC_DEFAULT_SONNET_MODEL: withOneM(sonnet, m.sonnetModelOneM)!,
      ANTHROPIC_DEFAULT_OPUS_MODEL: withOneM(opus, m.opusModelOneM)!,
      ANTHROPIC_DEFAULT_FABLE_MODEL: withOneM(fable, m.fableModelOneM)!,
    };
    if (m.haikuModelName)
      env.ANTHROPIC_DEFAULT_HAIKU_MODEL_NAME = m.haikuModelName;
    if (m.sonnetModelName)
      env.ANTHROPIC_DEFAULT_SONNET_MODEL_NAME = m.sonnetModelName;
    if (m.opusModelName)
      env.ANTHROPIC_DEFAULT_OPUS_MODEL_NAME = m.opusModelName;
    if (m.fableModelName)
      env.ANTHROPIC_DEFAULT_FABLE_MODEL_NAME = m.fableModelName;
    if (m.subagentModel) {
      env.CLAUDE_CODE_SUBAGENT_MODEL = withOneM(
        m.subagentModel,
        m.subagentModelOneM,
      )!;
    }
    return { env };
  }, [baseUrl, apiKey, models.claude]);

  // 计算 Codex 配置 JSON 预览
  const codexConfigJson = useMemo(() => {
    const m = models.codex ?? {};
    const model = m.model || "gpt-5.6-sol";
    const reasoningEffort = m.reasoningEffort || "high";
    // 确保 base_url 以 /v1 结尾（Codex 使用 OpenAI 兼容 API）
    const codexBaseUrl = baseUrl.endsWith("/v1")
      ? baseUrl
      : `${baseUrl.replace(/\/+$/, "")}/v1`;
    let configToml = `model_provider = "custom"
model = "${model}"
model_reasoning_effort = "${reasoningEffort}"
disable_response_storage = true`;
    // 顶层字段写在表头之前：TOML 里表头之后的键属于那张表
    if (m.contextWindow1M) {
      configToml += "\nmodel_context_window = 1000000";
      configToml += `\nmodel_auto_compact_token_limit = ${m.autoCompactLimit ?? 900000}`;
    } else if (m.autoCompactLimit) {
      configToml += `\nmodel_auto_compact_token_limit = ${m.autoCompactLimit}`;
    }
    configToml += `

[model_providers.custom]
name = "${m.remoteCompaction ? "OpenAI" : "NewAPI"}"
base_url = "${codexBaseUrl}"
wire_api = "responses"
requires_openai_auth = true`;
    // 子代理模型放最后：`[agents]` 表头之后的键都属于它
    if (m.subagentModel?.trim()) {
      configToml += `\n\n[agents]\ndefault_subagent_model = "${m.subagentModel.trim()}"`;
      if (m.subagentReasoningEffort?.trim()) {
        configToml += `\ndefault_subagent_reasoning_effort = "${m.subagentReasoningEffort.trim()}"`;
      }
    }
    const preview: Record<string, unknown> = {
      auth: { OPENAI_API_KEY: apiKey },
      config: configToml,
    };
    // 目录：用户填了就用它，否则和写 live 时一样从可用模型列表自动生成。
    const catalog =
      m.catalogModels && m.catalogModels.length > 0
        ? m.catalogModels
        : availableModels.map((model) => ({
            model: model.id,
            ...(model.displayName ? { displayName: model.displayName } : {}),
            ...(model.contextWindow
              ? { contextWindow: model.contextWindow }
              : {}),
          }));
    if (catalog.length > 0) {
      preview.modelCatalog = { models: catalog };
    }
    return preview;
  }, [baseUrl, apiKey, models.codex, availableModels]);

  // 计算 Gemini 配置 JSON 预览
  const geminiConfigJson = useMemo(() => {
    const m = models.gemini ?? {};
    const model = m.model || "gemini-2.5-pro";
    const preview: Record<string, unknown> = {
      env: {
        GOOGLE_GEMINI_BASE_URL: baseUrl,
        GEMINI_API_KEY: apiKey,
        GEMINI_MODEL: model,
        ...(m.env ?? {}),
      },
    };
    if (m.config && Object.keys(m.config).length > 0) {
      preview.config = m.config;
    }
    return preview;
  }, [baseUrl, apiKey, models.gemini]);

  // 计算 Claude Desktop 配置 JSON 预览（和后端投影同形）
  const claudeDesktopConfigJson = useMemo(() => {
    const routeMap: Record<string, Record<string, unknown>> = {};
    for (const row of desktopRoutes) {
      const routeId = row.routeId.trim();
      if (!routeId) continue;
      // 映射模式下没填上游模型的档位后端会丢掉，预览保持一致
      if (desktopMode === "proxy" && !row.model.trim()) continue;
      // 直连模式模型名必须与角色 ID 同名
      const model = desktopMode === "direct" ? routeId : row.model.trim();
      const entry: Record<string, unknown> = { model };
      if (row.labelOverride.trim()) {
        entry.labelOverride = row.labelOverride.trim();
      }
      if (row.supports1m) entry.supports1m = true;
      routeMap[routeId] = entry;
    }
    const meta: Record<string, unknown> = {
      claudeDesktopMode: desktopMode,
      claudeDesktopModelRoutes: routeMap,
    };
    if (desktopMode === "proxy" && models.claudeDesktop?.apiFormat) {
      meta.apiFormat = models.claudeDesktop.apiFormat;
    }
    return {
      env: {
        ANTHROPIC_BASE_URL: baseUrl,
        ANTHROPIC_AUTH_TOKEN: apiKey,
      },
      meta,
    };
  }, [baseUrl, apiKey, desktopMode, desktopRoutes, models.claudeDesktop]);

  // 计算 Grok Build 配置 TOML 预览
  const grokbuildConfigJson = useMemo(() => {
    const grok = models.grokbuild ?? {};
    const profile = grok.model?.trim() || "grok-4.5";
    const upstreamModel = grok.upstreamModel?.trim() || profile;
    const apiBackend = grok.apiBackend?.trim() || "responses";
    const contextWindow = grok.contextWindow ?? 500000;
    const config = `[models]
default = "${profile}"

[model."${profile}"]
model = "${upstreamModel}"
base_url = "${baseUrl}"
name = "${name}"
api_key = "${apiKey}"
api_backend = "${apiBackend}"
context_window = ${contextWindow}`;
    return { config };
  }, [baseUrl, apiKey, name, models.grokbuild]);

  // 构建 provider 对象的辅助函数：新建和编辑共用，字段与 per-app 设置一次写全
  const buildProvider = useCallback((): UniversalProvider | null => {
    if (!name.trim() || !baseUrl.trim() || !apiKey.trim()) {
      return null;
    }

    const base: UniversalProvider = editingProvider
      ? { ...editingProvider }
      : {
          id: crypto.randomUUID(),
          name: "",
          apps: {
            claude: false,
            codex: false,
            gemini: false,
            claudeDesktop: false,
            grokbuild: false,
          },
          baseUrl: "",
          apiKey: "",
          models: {},
          createdAt: Date.now(),
        };

    // 端点测速面板维护的自定义端点与「自动选择最佳端点」是统一供应商自己的设置，
    // 存进它的 meta：首次同步创建子供应商时作为初值，之后端点设置归各子供应商自己。
    // 重新保存时沿用原有的 addedAt / lastUsed，别把端点当成刚加的。
    const knownEndpoints = editingProvider?.meta?.custom_endpoints ?? {};
    const customEndpoints = Object.fromEntries(
      draftCustomEndpoints.map((url) => [
        url,
        knownEndpoints[url] ?? {
          url,
          addedAt: Date.now(),
          lastUsed: undefined,
        },
      ]),
    );
    const meta: ProviderMeta = {
      ...(editingProvider?.meta ?? {}),
      endpointAutoSelect,
      ...(draftCustomEndpoints.length > 0
        ? { custom_endpoints: customEndpoints }
        : {}),
    };
    if (draftCustomEndpoints.length === 0) {
      delete meta.custom_endpoints;
    }

    // Gemini 的两个 JSON 块在保存时才解析：填了非法 JSON 就当没配，不让它挡住保存。
    const parseBlock = (text: string): Record<string, unknown> | undefined => {
      try {
        const parsed = JSON.parse(text || "{}");
        if (
          parsed &&
          typeof parsed === "object" &&
          !Array.isArray(parsed) &&
          Object.keys(parsed).length > 0
        ) {
          return parsed as Record<string, unknown>;
        }
      } catch {
        // 非法 JSON：忽略这一块
      }
      return undefined;
    };
    const geminiEnv = parseBlock(geminiEnvText);
    const geminiConfig = parseBlock(geminiConfigText);

    // 请求覆盖：Header / Body 两个文本框，保存时才解析；两个都空就不写。
    const parseOverrides = (text: {
      headers: string;
      body: string;
    }): LocalProxyRequestOverrides | undefined => {
      const headers = parseBlock(text.headers);
      const body = parseBlock(text.body);
      if (!headers && !body) return undefined;
      return {
        ...(headers ? { headers: headers as Record<string, string> } : {}),
        ...(body ? { body } : {}),
      };
    };
    const claudeOverridesParsed = parseOverrides(claudeOverrides);
    const codexOverridesParsed = parseOverrides(codexOverrides);

    // Gemini 的 .env / settings.json 文本块要能独立成块：新建时不再预填模型，
    // models.gemini 可能还不存在，但用户在卡片里填的块仍要存下来。
    const geminiNext: GeminiModelConfig = {
      ...(models.gemini ?? {}),
      ...(geminiEnv ? { env: geminiEnv as Record<string, string> } : {}),
      ...(geminiConfig ? { config: geminiConfig } : {}),
    };
    const nextModels: UniversalProviderModels = {
      ...models,
      ...(models.gemini || geminiEnv || geminiConfig
        ? { gemini: geminiNext }
        : {}),
    };
    if (nextModels.gemini) {
      if (!geminiEnv) delete nextModels.gemini.env;
      if (!geminiConfig) delete nextModels.gemini.config;
    }
    if (nextModels.claude) {
      nextModels.claude = {
        ...nextModels.claude,
        ...(claudeOverridesParsed
          ? { requestOverrides: claudeOverridesParsed }
          : {}),
        // 全局开关也存进 models.claude：后端读它写进 live（不是写供应商行）。
        // 只有用户这次动过的才写；没动过的保持原样（不写 = 后端不动 live）。
        ...(claudeGlobalsTouched.current.hideAttribution
          ? { hideAttribution: claudeHideAttribution }
          : {}),
        ...(claudeGlobalsTouched.current.disableAutoUpgrade
          ? { disableAutoUpgrade: claudeDisableAutoUpgrade }
          : {}),
      };
      if (!claudeOverridesParsed) delete nextModels.claude.requestOverrides;
      if (!claudeGlobalsTouched.current.hideAttribution) {
        delete nextModels.claude.hideAttribution;
      }
      if (!claudeGlobalsTouched.current.disableAutoUpgrade) {
        delete nextModels.claude.disableAutoUpgrade;
      }
    }
    if (nextModels.claudeDesktop) {
      // 旧版扁平字段只读：迁移成 routes 后必须丢掉，否则老值会一直跟着记录。
      const {
        sonnetModel: _sonnetModel,
        opusModel: _opusModel,
        haikuModel: _haikuModel,
        labelOverride: _labelOverride,
        sonnetOneM: _sonnetOneM,
        opusOneM: _opusOneM,
        haikuOneM: _haikuOneM,
        ...desktopConfig
      } = nextModels.claudeDesktop;
      nextModels.claudeDesktop = desktopConfig;

      // 路由表：丢掉空行；直连模式的模型名由后端强制成角色 ID，这里只存角色 ID。
      // 映射模式下没填上游模型的行也丢掉——留着空模型会把后端的默认四档顶掉，
      // 整张表会写成空模型名。
      const routes: Record<string, ClaudeDesktopModelRoute> = {};
      for (const row of desktopRoutes) {
        const routeId = row.routeId.trim();
        if (!routeId) continue;
        if (desktopMode === "proxy" && !row.model.trim()) continue;
        const entry: ClaudeDesktopModelRoute = {
          model: desktopMode === "direct" ? routeId : row.model.trim(),
        };
        if (row.labelOverride.trim()) {
          entry.labelOverride = row.labelOverride.trim();
        }
        if (row.supports1m) entry.supports1m = true;
        routes[routeId] = entry;
      }
      nextModels.claudeDesktop = {
        ...nextModels.claudeDesktop,
        mode: desktopMode,
        ...(Object.keys(routes).length > 0 ? { routes } : {}),
      };
      if (Object.keys(routes).length === 0) {
        delete nextModels.claudeDesktop.routes;
      }
      // 直连不能带上游格式
      if (desktopMode === "direct") {
        delete nextModels.claudeDesktop.apiFormat;
      }
    }
    if (nextModels.codex) {
      // 目录不再由表单维护（后端从可用模型列表自动生成），只带请求覆盖。
      nextModels.codex = {
        ...nextModels.codex,
        ...(codexOverridesParsed
          ? { requestOverrides: codexOverridesParsed }
          : {}),
      };
      if (!codexOverridesParsed) delete nextModels.codex.requestOverrides;
      delete nextModels.codex.catalogModels;
    }

    return {
      ...base,
      name: name.trim(),
      baseUrl: baseUrl.trim(),
      apiKey: apiKey.trim(),
      websiteUrl: websiteUrl.trim() || undefined,
      notes: notes.trim() || undefined,
      icon: icon.trim() || undefined,
      iconColor: iconColor.trim() || undefined,
      apps: {
        claude: true,
        codex: true,
        gemini: true,
        claudeDesktop: true,
        grokbuild: true,
      },
      models: nextModels,
      // 可用模型列表要一起存：它是所有应用共用的那份，模型下拉也从这里来。
      // 手加的空行（id 还没填）只是草稿，不落库。
      ...(() => {
        const named = availableModels.filter((model) => model.id.trim());
        return named.length > 0 ? { availableModels: named } : {};
      })(),
      meta,
    };
  }, [
    editingProvider,
    geminiEnvText,
    geminiConfigText,
    claudeOverrides,
    claudeHideAttribution,
    claudeDisableAutoUpgrade,
    codexOverrides,
    desktopMode,
    desktopRoutes,
    name,
    baseUrl,
    apiKey,
    websiteUrl,
    notes,
    icon,
    iconColor,
    models,
    availableModels,
    draftCustomEndpoints,
    endpointAutoSelect,
  ]);

  // 端点测速面板的初始候选：当前 API 地址 + 已保存的自定义端点
  const endpointCandidates = useMemo(() => {
    const map = new Map<string, { url: string; isCustom: boolean }>();
    const add = (raw: string, isCustom: boolean) => {
      const url = raw.trim().replace(/\/+$/, "");
      if (url) map.set(url, { url, isCustom });
    };
    add(baseUrl, false);
    draftCustomEndpoints.forEach((url) => add(url, true));
    return Array.from(map.values());
  }, [baseUrl, draftCustomEndpoints]);

  // 提交表单
  const handleSubmit = useCallback(() => {
    const provider = buildProvider();
    if (!provider) return;

    onSave(provider);
    onClose();
  }, [buildProvider, onSave, onClose]);

  // 打开保存并同步确认弹窗
  const handleSaveAndSyncClick = useCallback(() => {
    const provider = buildProvider();
    if (!provider || !onSaveAndSync) return;

    setPendingProvider(provider);
    setSyncConfirmOpen(true);
  }, [buildProvider, onSaveAndSync]);

  // 确认保存并同步
  const confirmSaveAndSync = useCallback(() => {
    if (!pendingProvider || !onSaveAndSync) return;

    onSaveAndSync(pendingProvider);
    setSyncConfirmOpen(false);
    setPendingProvider(null);
    onClose();
  }, [pendingProvider, onSaveAndSync, onClose]);

  /**
   * 拉取可用模型：后端问供应商的 `/v1/models`，再用 models.dev 补名称和上下文窗口，
   * 结果写回该供应商。新建时还没有 id，先不拉。
   */
  const handleFetchModels = useCallback(async () => {
    // 编辑已存的那家用它的 id（后端写回）；新建时用表单当前填的地址和 Key 现拉。
    if (!editingProvider && (!baseUrl.trim() || !apiKey.trim())) {
      toast.error(
        t("universalProvider.fetchNeedsEndpoint", {
          defaultValue: "先填写 API 地址和 API Key，再获取模型列表",
        }),
      );
      return;
    }
    const target = editingProvider
      ? { id: editingProvider.id }
      : { baseUrl: baseUrl.trim(), apiKey: apiKey.trim() };
    setModelsLoading(true);
    try {
      const fetched = await universalProvidersApi.refreshModels(target);
      setAvailableModels(fetched);
      setFetchedModels(fetched);
      toast.success(
        t("universalProvider.modelsFetched", {
          defaultValue: `已获取 ${fetched.length} 个模型`,
        }),
      );
    } catch (error) {
      console.error(
        "[UniversalProviderFormModal] Failed to fetch models",
        error,
      );
      toast.error(
        extractErrorMessage(error) ||
          t("universalProvider.modelsFetchFailed", {
            defaultValue: "获取模型列表失败",
          }),
      );
    } finally {
      setModelsLoading(false);
    }
  }, [editingProvider, baseUrl, apiKey, t]);

  const footer = (
    <>
      {isEditMode && onDelete && editingProvider && (
        <Button
          variant="outline"
          className="mr-auto text-danger-text hover:text-danger-text"
          onClick={() => onDelete(editingProvider)}
        >
          <Trash2 className="mr-1.5 h-4 w-4" />
          {t("common.delete", { defaultValue: "删除" })}
        </Button>
      )}
      <Button variant="outline" onClick={onClose}>
        {t("common.cancel", { defaultValue: "取消" })}
      </Button>
      {isEditMode && onSaveAndSync ? (
        <Button
          onClick={handleSaveAndSyncClick}
          disabled={!name.trim() || !baseUrl.trim() || !apiKey.trim()}
        >
          <RefreshCw className="mr-1.5 h-4 w-4" />
          {t("universalProvider.saveAndSync", { defaultValue: "保存并同步" })}
        </Button>
      ) : (
        <Button
          onClick={handleSubmit}
          disabled={!name.trim() || !baseUrl.trim() || !apiKey.trim()}
        >
          {t("common.add", { defaultValue: "添加" })}
        </Button>
      )}
    </>
  );

  return (
    <FullScreenPanel
      isOpen={isOpen}
      trackUnsavedChanges
      title={
        isEditMode
          ? t("universalProvider.edit", { defaultValue: "编辑统一供应商" })
          : t("universalProvider.add", { defaultValue: "添加统一供应商" })
      }
      onClose={onClose}
      subtitle={subtitle}
      actions={manageAction}
      footer={footer}
    >
      {/* 用真正的 form 包住字段，提交走本表单页脚的按钮 */}
      <form
        id="universal-provider-form"
        className="space-y-6"
        onSubmit={(event) => {
          event.preventDefault();
          if (isEditMode && onSaveAndSync) {
            handleSaveAndSyncClick();
          } else {
            handleSubmit();
          }
        }}
      >
        {/* 基本信息 */}
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">
              {t("universalProvider.name", { defaultValue: "名称" })}
            </Label>
            <div className="flex items-center gap-2">
              <Dialog open={iconDialogOpen} onOpenChange={setIconDialogOpen}>
                <HoverTip
                  content={
                    icon
                      ? t("providerIcon.clickToChange", {
                          defaultValue: "点击更换图标",
                        })
                      : t("providerIcon.clickToSelect", {
                          defaultValue: "点击选择图标",
                        })
                  }
                >
                  <DialogTrigger asChild>
                    <button
                      type="button"
                      aria-label={t("providerIcon.change", {
                        defaultValue: "更换图标",
                      })}
                      className="group shrink-0 rounded-[8px]"
                    >
                      <ProviderIconBox
                        icon={icon}
                        name={name || "Provider"}
                        color={
                          iconColor ||
                          (icon
                            ? getIconMetadata(icon)?.defaultColor
                            : undefined)
                        }
                        className="bg-surface transition-colors group-hover:bg-subtle"
                      />
                    </button>
                  </DialogTrigger>
                </HoverTip>
                <DialogContent
                  variant="fullscreen"
                  zIndex="top"
                  overlayClassName="bg-[hsl(var(--background))] backdrop-blur-0"
                  className="p-0 sm:rounded-none"
                >
                  <div className="flex h-full flex-col">
                    <div className="flex-shrink-0 border-b border-border bg-subtle py-4">
                      <div className="flex items-center gap-4 px-6">
                        <DialogClose asChild>
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            aria-label={t("common.back")}
                          >
                            <ArrowLeft className="h-4 w-4" />
                          </Button>
                        </DialogClose>
                        <p className="text-lg font-semibold leading-tight">
                          {t("providerIcon.selectIcon", {
                            defaultValue: "选择图标",
                          })}
                        </p>
                      </div>
                    </div>
                    <div className="flex-1 overflow-y-auto">
                      <div className="w-full space-y-2 px-6 py-6">
                        <IconPicker
                          value={icon}
                          onValueChange={handleIconSelect}
                          color={iconColor}
                        />
                        <div className="flex justify-end gap-2">
                          <DialogClose asChild>
                            <Button type="button" variant="outline">
                              {t("common.done", { defaultValue: "完成" })}
                            </Button>
                          </DialogClose>
                        </div>
                      </div>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("universalProvider.namePlaceholder", {
                  defaultValue: "例如：我的 NewAPI",
                })}
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label htmlFor="baseUrl">
                {t("universalProvider.baseUrl", { defaultValue: "API 地址" })}
              </Label>
              <button
                type="button"
                onClick={() => setIsEndpointModalOpen(true)}
                className="flex items-center gap-1 text-caption text-fg-2 transition-colors hover:text-fg-1"
              >
                <Zap className="h-3.5 w-3.5" />
                {t("providerForm.manageAndTest", {
                  defaultValue: "管理和测速",
                })}
              </button>
            </div>
            <Input
              id="baseUrl"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://api.example.com"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="apiKey">
              {t("universalProvider.apiKey", { defaultValue: "API Key" })}
            </Label>
            <div className="relative">
              <Input
                id="apiKey"
                type={showApiKey ? "text" : "password"}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-..."
                className="pr-10"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-0 top-0 h-full px-3"
                onClick={() => setShowApiKey(!showApiKey)}
              >
                {showApiKey ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="websiteUrl">
              {t("universalProvider.websiteUrl", { defaultValue: "官网地址" })}
            </Label>
            <Input
              id="websiteUrl"
              value={websiteUrl}
              onChange={(e) => setWebsiteUrl(e.target.value)}
              placeholder={t("universalProvider.websiteUrlPlaceholder", {
                defaultValue: "https://example.com（可选，用于在列表中显示）",
              })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">
              {t("universalProvider.notes", { defaultValue: "备注" })}
            </Label>
            <Input
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t("universalProvider.notesPlaceholder", {
                defaultValue: "可选：添加备注信息",
              })}
            />
          </div>
        </div>

        {/* 模型列表：所有应用共用，表单里的模型下拉和各应用的目录都由它而来 */}
        <AvailableModelsEditor
          models={availableModels}
          onChange={setAvailableModels}
          onRefresh={() => void handleFetchModels()}
          refreshing={modelsLoading}
          fetched={fetchedModels}
        />

        {/* 各应用的专属字段。统一供应商始终同步到全部五个应用，没有开关。 */}
        <div className="space-y-3">
          <Label>
            {t("universalProvider.appFields", {
              defaultValue: "各应用的配置",
            })}
          </Label>
          <div className="flex flex-col gap-3">
            <div className="rounded-lg border p-3">
              <div className="flex items-center gap-2">
                <ProviderIcon icon="claude" name="Claude" size={20} />
                <span className="font-medium">Claude Code</span>
              </div>
              <div className="pt-3">
                <div className="grid gap-3 sm:grid-cols-2 border-t pt-3">
                  <div className="space-y-1">
                    <Label className="text-xs">
                      {t("universalProvider.mainModel", {
                        defaultValue: "主模型",
                      })}
                    </Label>
                    <ModelSelect
                      models={availableModels}
                      value={models.claude?.model || ""}
                      onChange={(value) =>
                        updateModel("claude", "model", value)
                      }
                      label={t("modelLabel", {
                        defaultValue: "主模型",
                      })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Sonnet</Label>
                    <ModelSelect
                      models={availableModels}
                      value={models.claude?.sonnetModel || ""}
                      onChange={(value) =>
                        updateModel("claude", "sonnetModel", value)
                      }
                      label={t("sonnetModelLabel", {
                        defaultValue: "Sonnet",
                      })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Opus</Label>
                    <ModelSelect
                      models={availableModels}
                      value={models.claude?.opusModel || ""}
                      onChange={(value) =>
                        updateModel("claude", "opusModel", value)
                      }
                      label={t("opusModelLabel", {
                        defaultValue: "Opus",
                      })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Fable</Label>
                    <ModelSelect
                      models={availableModels}
                      value={models.claude?.fableModel || ""}
                      onChange={(value) =>
                        updateModel("claude", "fableModel", value)
                      }
                      label={t("fableModelLabel", {
                        defaultValue: "Fable",
                      })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Haiku</Label>
                    <ModelSelect
                      models={availableModels}
                      value={models.claude?.haikuModel || ""}
                      onChange={(value) =>
                        updateModel("claude", "haikuModel", value)
                      }
                      label={t("haikuModelLabel", {
                        defaultValue: "Haiku",
                      })}
                    />
                  </div>
                </div>

                {/* 声明支持 1M：和单应用表单一样，把标记加到模型名末尾 */}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t pt-3 text-xs text-fg-2">
                  <span>
                    {t("universalProvider.modelOneM", {
                      defaultValue: "声明支持 1M",
                    })}
                  </span>
                  {(
                    [
                      [
                        "modelOneM",
                        "universalProvider.mainModelOneM",
                        "主模型",
                      ],
                      ["sonnetModelOneM", "Sonnet", "Sonnet"],
                      ["opusModelOneM", "Opus", "Opus"],
                      ["fableModelOneM", "Fable", "Fable"],
                      ["haikuModelOneM", "Haiku", "Haiku"],
                      [
                        "subagentModelOneM",
                        "universalProvider.subagentModel",
                        "Subagent",
                      ],
                    ] as const
                  ).map(([field, key, fallback]) => (
                    <label
                      key={field}
                      className="inline-flex cursor-pointer items-center gap-1.5"
                    >
                      <input
                        type="checkbox"
                        className="ui-checkbox"
                        checked={models.claude?.[field] === true}
                        onChange={(e) =>
                          updateModel("claude", field, e.target.checked)
                        }
                      />
                      {t(key, { defaultValue: fallback })}
                    </label>
                  ))}
                </div>

                <div className="grid gap-3 sm:grid-cols-2 border-t pt-3">
                  <div className="space-y-1">
                    <Label className="text-xs">
                      {t("universalProvider.apiFormat", {
                        defaultValue: "上游格式",
                      })}
                    </Label>
                    <Select
                      value={models.claude?.apiFormat || "anthropic"}
                      onValueChange={(value) =>
                        updateModel("claude", "apiFormat", value)
                      }
                    >
                      <SelectTrigger aria-label="上游格式">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="anthropic">
                          Anthropic Messages
                        </SelectItem>
                        <SelectItem value="openai_chat">
                          Chat Completions
                        </SelectItem>
                        <SelectItem value="openai_responses">
                          Responses
                        </SelectItem>
                        <SelectItem value="gemini_native">
                          Gemini Native
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">
                      {t("universalProvider.apiKeyField", {
                        defaultValue: "认证字段",
                      })}
                    </Label>
                    <Select
                      value={
                        models.claude?.apiKeyField || "ANTHROPIC_AUTH_TOKEN"
                      }
                      onValueChange={(value) =>
                        updateModel("claude", "apiKeyField", value)
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ANTHROPIC_AUTH_TOKEN">
                          ANTHROPIC_AUTH_TOKEN
                        </SelectItem>
                        <SelectItem value="ANTHROPIC_API_KEY">
                          ANTHROPIC_API_KEY
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1 sm:col-span-2">
                    <Label className="text-xs">
                      {t("providerForm.customUserAgent", {
                        defaultValue: "自定义 User-Agent",
                      })}
                    </Label>
                    <Input
                      value={models.claude?.customUserAgent || ""}
                      onChange={(e) =>
                        updateModel("claude", "customUserAgent", e.target.value)
                      }
                      placeholder="claude-cli/2.0.0"
                    />
                  </div>
                </div>

                {/* /model 菜单里的显示名 + subagent 模型 */}
                <div className="grid gap-3 sm:grid-cols-2 border-t pt-3">
                  {(
                    [
                      ["sonnetModelName", "Sonnet"],
                      ["opusModelName", "Opus"],
                      ["fableModelName", "Fable"],
                      ["haikuModelName", "Haiku"],
                    ] as const
                  ).map(([field, label]) => (
                    <div key={field} className="space-y-1">
                      <Label className="text-xs">
                        {label}{" "}
                        {t("providerForm.modelDisplayNameLabel", {
                          defaultValue: "显示名称",
                        })}
                      </Label>
                      <Input
                        value={models.claude?.[field] || ""}
                        onChange={(e) =>
                          updateModel("claude", field, e.target.value)
                        }
                        placeholder={label.toLowerCase()}
                      />
                    </div>
                  ))}
                  <div className="space-y-1">
                    <Label className="text-xs">
                      {t("universalProvider.subagentModel", {
                        defaultValue: "Subagent 模型",
                      })}
                    </Label>
                    <ModelSelect
                      models={availableModels}
                      value={models.claude?.subagentModel || ""}
                      onChange={(value) =>
                        updateModel("claude", "subagentModel", value)
                      }
                      label={t("subagentModelLabel", {
                        defaultValue: "子代理模型",
                      })}
                    />
                  </div>
                </div>

                {/* 上游兼容开关：随供应商切换（后端 floor.rs 的独有字段） */}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t pt-3 text-xs text-fg-2">
                  {(
                    [
                      [
                        "enableToolSearch",
                        "claudeConfig.enableToolSearch",
                        "启用 Tool Search",
                      ],
                      [
                        "disableArtifact",
                        "claudeConfig.disableArtifact",
                        "禁用 Artifact 工具",
                      ],
                      [
                        "disableAutoModeServer",
                        "claudeConfig.disableAutoModeServer",
                        "关闭 auto mode 服务端检查",
                      ],
                    ] as const
                  ).map(([field, key, fallback]) => (
                    <span
                      key={field}
                      className="inline-flex items-center gap-1"
                    >
                      <label className="inline-flex cursor-pointer items-center gap-1.5">
                        <input
                          type="checkbox"
                          className="ui-checkbox"
                          checked={models.claude?.[field] === true}
                          onChange={(e) =>
                            updateModel("claude", field, e.target.checked)
                          }
                        />
                        {t(key, { defaultValue: fallback })}
                      </label>
                      <HoverTip
                        content={t(`${key}Help`, { defaultValue: fallback })}
                      >
                        <span className="text-fg-3">?</span>
                      </HoverTip>
                    </span>
                  ))}
                </div>

                {/* 本地路由请求覆盖 */}
                <div className="grid gap-3 sm:grid-cols-2 border-t pt-3">
                  {(
                    [
                      [
                        "headers",
                        "providerForm.localProxyHeaderOverrides",
                        "Header 覆盖",
                      ],
                      [
                        "body",
                        "providerForm.localProxyBodyOverrides",
                        "Body 覆盖",
                      ],
                    ] as const
                  ).map(([field, key, fallback]) => (
                    <div key={field} className="space-y-1">
                      <Label className="text-xs">
                        {t(key, { defaultValue: fallback })}
                      </Label>
                      <Textarea
                        value={claudeOverrides[field]}
                        onChange={(e) =>
                          setClaudeOverrides((prev) => ({
                            ...prev,
                            [field]: e.target.value,
                          }))
                        }
                        className="min-h-[72px] resize-y font-mono text-xs"
                        placeholder={'{\n  "X-Provider": "cc-switch"\n}'}
                      />
                    </div>
                  ))}
                </div>
                {/* Claude JSON */}
                {claudeConfigJson && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <ProviderIcon icon="claude" name="Claude" size={16} />
                      Claude
                    </div>
                    <p className="text-xs text-fg-2">
                      {t("claudeConfig.keyFieldsHint", {
                        defaultValue:
                          "地址、Key、模型、上下文窗口和兼容开关随供应商切换；其余字段是 Claude Code 全局设置，保存后对所有供应商生效。",
                      })}
                    </p>
                    {/* 全局开关：对所有供应商生效，所以写进 live 而不是供应商行 */}
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                      {(
                        [
                          [
                            claudeHideAttribution,
                            setClaudeHideAttribution,
                            "hideAttribution",
                            "claudeConfig.hideAttribution",
                            "隐藏 AI 署名",
                          ],
                          [
                            claudeDisableAutoUpgrade,
                            setClaudeDisableAutoUpgrade,
                            "disableAutoUpgrade",
                            "claudeConfig.disableAutoUpgrade",
                            "禁用自动升级",
                          ],
                        ] as const
                      ).map(([checked, onChange, field, key, fallback]) => (
                        <span
                          key={key}
                          className="inline-flex items-center gap-1"
                        >
                          <label className="inline-flex cursor-pointer items-center gap-1.5 text-sm text-fg-2">
                            <input
                              type="checkbox"
                              className="ui-checkbox"
                              checked={checked}
                              onChange={(e) => {
                                // 记下用户动过：只有动过的全局开关才会写进 live
                                claudeGlobalsTouched.current[field] = true;
                                onChange(e.target.checked);
                              }}
                            />
                            {t(key, { defaultValue: fallback })}
                          </label>
                          <HoverTip
                            content={t(`${key}Help`, {
                              defaultValue: fallback,
                            })}
                          >
                            <span className="text-fg-3">?</span>
                          </HoverTip>
                        </span>
                      ))}
                    </div>
                    <JsonEditor
                      value={JSON.stringify(claudeConfigJson, null, 2)}
                      onChange={() => {}}
                      height={180}
                      darkMode={isDarkMode}
                    />
                  </div>
                )}
              </div>
            </div>
            <div className="rounded-lg border p-3">
              <div className="flex items-center gap-2">
                <ProviderIcon icon="openai" name="Codex" size={20} />
                <span className="font-medium">OpenAI Codex</span>
              </div>
              <div className="pt-3">
                <div className="grid gap-3 sm:grid-cols-2 border-t pt-3">
                  <div className="space-y-1">
                    <Label className="text-xs">
                      {t("universalProvider.model", { defaultValue: "模型" })}
                    </Label>
                    <ModelSelect
                      models={availableModels}
                      value={models.codex?.model || ""}
                      onChange={(value) => updateModel("codex", "model", value)}
                      label={t("modelLabel", { defaultValue: "模型" })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Reasoning Effort</Label>
                    <Input
                      value={models.codex?.reasoningEffort || ""}
                      onChange={(e) =>
                        updateModel("codex", "reasoningEffort", e.target.value)
                      }
                      placeholder="high"
                    />
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 border-t pt-3">
                  <div className="space-y-1">
                    <Label className="text-xs">
                      {t("universalProvider.apiFormat", {
                        defaultValue: "上游格式",
                      })}
                    </Label>
                    <Select
                      value={models.codex?.apiFormat || "openai_responses"}
                      onValueChange={(value) =>
                        updateModel("codex", "apiFormat", value)
                      }
                    >
                      <SelectTrigger aria-label="上游格式">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="openai_responses">
                          Responses
                        </SelectItem>
                        <SelectItem value="openai_chat">
                          Chat Completions
                        </SelectItem>
                        <SelectItem value="anthropic">
                          Anthropic Messages
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">
                      {t("universalProvider.apiKeyField", {
                        defaultValue: "认证字段",
                      })}
                    </Label>
                    <Select
                      value={
                        models.codex?.apiKeyField || "ANTHROPIC_AUTH_TOKEN"
                      }
                      onValueChange={(value) =>
                        updateModel("codex", "apiKeyField", value)
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ANTHROPIC_AUTH_TOKEN">
                          ANTHROPIC_AUTH_TOKEN
                        </SelectItem>
                        <SelectItem value="ANTHROPIC_API_KEY">
                          ANTHROPIC_API_KEY
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">
                      {t("codexConfig.autoCompactLimit", {
                        defaultValue: "压缩阈值",
                      })}
                    </Label>
                    <Input
                      inputMode="numeric"
                      value={models.codex?.autoCompactLimit?.toString() ?? ""}
                      onChange={(e) =>
                        updateModel(
                          "codex",
                          "autoCompactLimit",
                          e.target.value.replace(/\D/g, ""),
                        )
                      }
                      placeholder="900000"
                      disabled={models.codex?.contextWindow1M !== true}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">
                      {t("providerForm.customUserAgent", {
                        defaultValue: "自定义 User-Agent",
                      })}
                    </Label>
                    <Input
                      value={models.codex?.customUserAgent || ""}
                      onChange={(e) =>
                        updateModel("codex", "customUserAgent", e.target.value)
                      }
                      placeholder="codex/1.0"
                    />
                  </div>
                </div>

                {/* 配置文件的开关：1M 上下文窗口、压缩阈值、远程压缩 */}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t pt-3 text-xs text-fg-2">
                  <label className="inline-flex cursor-pointer items-center gap-1.5">
                    <input
                      type="checkbox"
                      className="ui-checkbox"
                      checked={models.codex?.contextWindow1M === true}
                      onChange={(e) =>
                        updateModel(
                          "codex",
                          "contextWindow1M",
                          e.target.checked,
                        )
                      }
                    />
                    {t("codexConfig.contextWindow1M", {
                      defaultValue: "1M 上下文窗口",
                    })}
                  </label>
                  <label
                    className="inline-flex cursor-pointer items-center gap-1.5"
                    title={t("codexConfig.remoteCompactionHint", {
                      defaultValue:
                        "开启后会将当前 model_providers 条目的 name 写为 OpenAI，使 Codex 尝试使用远程压缩。",
                    })}
                  >
                    <input
                      type="checkbox"
                      className="ui-checkbox"
                      checked={models.codex?.remoteCompaction === true}
                      onChange={(e) =>
                        updateModel(
                          "codex",
                          "remoteCompaction",
                          e.target.checked,
                        )
                      }
                    />
                    {t("codexConfig.enableRemoteCompaction", {
                      defaultValue: "启用远程压缩",
                    })}
                  </label>
                  <label className="inline-flex cursor-pointer items-center gap-1.5">
                    <input
                      type="checkbox"
                      className="ui-checkbox"
                      checked={models.codex?.impersonateClaudeCode === true}
                      onChange={(e) =>
                        updateModel(
                          "codex",
                          "impersonateClaudeCode",
                          e.target.checked,
                        )
                      }
                    />
                    {t("codexConfig.impersonateClaudeCodeLabel", {
                      defaultValue: "模拟 Claude Code 客户端",
                    })}
                  </label>
                  <label className="inline-flex cursor-pointer items-center gap-1.5">
                    <input
                      type="checkbox"
                      className="ui-checkbox"
                      checked={models.codex?.isFullUrl === true}
                      onChange={(e) =>
                        updateModel("codex", "isFullUrl", e.target.checked)
                      }
                    />
                    {t("providerForm.fullUrlLabel", {
                      defaultValue: "完整 URL",
                    })}
                  </label>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 border-t pt-3">
                  <div className="space-y-1">
                    <Label className="text-xs">
                      {t("codexConfig.maxOutputTokensLabel", {
                        defaultValue: "最大输出 tokens",
                      })}
                    </Label>
                    <Input
                      inputMode="numeric"
                      value={models.codex?.maxOutputTokens?.toString() ?? ""}
                      onChange={(e) =>
                        updateModel(
                          "codex",
                          "maxOutputTokens",
                          e.target.value.replace(/\D/g, ""),
                        )
                      }
                      placeholder="32000"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">
                      {t("codexConfig.subagentModelLabel", {
                        defaultValue: "子代理模型",
                      })}
                    </Label>
                    <ModelSelect
                      models={availableModels}
                      value={models.codex?.subagentModel || ""}
                      onChange={(value) =>
                        updateModel("codex", "subagentModel", value)
                      }
                      label={t("subagentModelLabel", {
                        defaultValue: "子代理模型",
                      })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">
                      {t("codexConfig.subagentReasoningEffortLabel", {
                        defaultValue: "子代理推理档位",
                      })}
                    </Label>
                    <Input
                      value={models.codex?.subagentReasoningEffort || ""}
                      onChange={(e) =>
                        updateModel(
                          "codex",
                          "subagentReasoningEffort",
                          e.target.value,
                        )
                      }
                      placeholder="low"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">
                      {t("codexConfig.promptCacheRoutingLabel", {
                        defaultValue: "提示词缓存路由",
                      })}
                    </Label>
                    <Select
                      value={models.codex?.promptCacheRouting || "auto"}
                      onValueChange={(value) =>
                        updateModel("codex", "promptCacheRouting", value)
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="auto">
                          {t("codexConfig.promptCacheRoutingAuto", {
                            defaultValue: "自动",
                          })}
                        </SelectItem>
                        <SelectItem value="enabled">
                          {t("codexConfig.promptCacheRoutingEnabled", {
                            defaultValue: "开启",
                          })}
                        </SelectItem>
                        <SelectItem value="disabled">
                          {t("codexConfig.promptCacheRoutingDisabled", {
                            defaultValue: "关闭",
                          })}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* 思考能力（走 Chat Completions 时声明） */}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t pt-3 text-xs text-fg-2">
                  <span>
                    {t("codexConfig.reasoningGroupTitle", {
                      defaultValue: "思考能力",
                    })}
                  </span>
                  <label className="inline-flex cursor-pointer items-center gap-1.5">
                    <input
                      type="checkbox"
                      className="ui-checkbox"
                      checked={
                        models.codex?.chatReasoning?.supportsThinking === true
                      }
                      onChange={(e) =>
                        updateChatReasoning(
                          "supportsThinking",
                          e.target.checked,
                        )
                      }
                    />
                    {t("codexConfig.reasoningModeToggle", {
                      defaultValue: "支持思考模式",
                    })}
                  </label>
                  <label className="inline-flex cursor-pointer items-center gap-1.5">
                    <input
                      type="checkbox"
                      className="ui-checkbox"
                      checked={
                        models.codex?.chatReasoning?.supportsEffort === true
                      }
                      onChange={(e) =>
                        updateChatReasoning("supportsEffort", e.target.checked)
                      }
                    />
                    {t("codexConfig.reasoningEffortToggle", {
                      defaultValue: "支持思考等级",
                    })}
                  </label>
                </div>

                {/* 模型目录不再手填：后端用统一供应商的可用模型列表自动生成
                    （名称与上下文窗口来自拉取时的 models.dev 补全）。 */}
                <p className="border-t pt-3 text-xs text-fg-2">
                  {t("codexConfig.catalogAutoHint", {
                    defaultValue:
                      "Codex 的 /model 菜单由可用模型列表自动生成；想调整就先在上面维护模型列表。",
                  })}
                </p>

                {/* 本地路由请求覆盖 */}
                <div className="grid gap-3 sm:grid-cols-2 border-t pt-3">
                  {(
                    [
                      [
                        "headers",
                        "providerForm.localProxyHeaderOverrides",
                        "Header 覆盖",
                      ],
                      [
                        "body",
                        "providerForm.localProxyBodyOverrides",
                        "Body 覆盖",
                      ],
                    ] as const
                  ).map(([field, key, fallback]) => (
                    <div key={field} className="space-y-1">
                      <Label className="text-xs">
                        {t(key, { defaultValue: fallback })}
                      </Label>
                      <Textarea
                        value={codexOverrides[field]}
                        onChange={(e) =>
                          setCodexOverrides((prev) => ({
                            ...prev,
                            [field]: e.target.value,
                          }))
                        }
                        className="min-h-[72px] resize-y font-mono text-xs"
                        placeholder={'{\n  "X-Provider": "cc-switch"\n}'}
                      />
                    </div>
                  ))}
                </div>
                {/* Codex JSON */}
                {codexConfigJson && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <ProviderIcon icon="openai" name="Codex" size={16} />
                      Codex
                    </div>
                    <JsonEditor
                      value={JSON.stringify(codexConfigJson, null, 2)}
                      onChange={() => {}}
                      height={280}
                      darkMode={isDarkMode}
                    />
                  </div>
                )}
              </div>
            </div>
            <div className="rounded-lg border p-3">
              <div className="flex items-center gap-2">
                <ProviderIcon icon="gemini" name="Gemini" size={20} />
                <span className="font-medium">Gemini CLI</span>
              </div>
              <div className="pt-3">
                <div className="space-y-1 border-t pt-3">
                  <Label className="text-xs">
                    {t("universalProvider.model", { defaultValue: "模型" })}
                  </Label>
                  <ModelSelect
                    models={availableModels}
                    value={models.gemini?.model || ""}
                    onChange={(value) => updateModel("gemini", "model", value)}
                    label={t("universalProvider.modelField", {
                      defaultValue: "模型",
                    })}
                  />
                </div>
                {/* .env / settings.json 里的其他键：跟这个应用一起切换 */}
                <div className="space-y-1 border-t pt-3">
                  <Label className="text-xs">
                    {t("geminiConfig.envFile", {
                      defaultValue: "环境变量 (.env)",
                    })}
                  </Label>
                  <JsonEditor
                    value={geminiEnvText}
                    onChange={setGeminiEnvText}
                    height={140}
                    darkMode={isDarkMode}
                  />
                </div>
                <div className="space-y-1 border-t pt-3">
                  <Label className="text-xs">
                    {t("geminiConfig.configJson", {
                      defaultValue: "settings.json",
                    })}
                  </Label>
                  <JsonEditor
                    value={geminiConfigText}
                    onChange={setGeminiConfigText}
                    height={140}
                    darkMode={isDarkMode}
                  />
                </div>
                {/* Gemini JSON */}
                {geminiConfigJson && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <ProviderIcon icon="gemini" name="Gemini" size={16} />
                      Gemini
                    </div>
                    <JsonEditor
                      value={JSON.stringify(geminiConfigJson, null, 2)}
                      onChange={() => {}}
                      height={140}
                      darkMode={isDarkMode}
                    />
                  </div>
                )}
              </div>
            </div>
            <div className="rounded-lg border p-3">
              <div className="flex items-center gap-2">
                <ProviderIcon icon="claude" name="Claude Desktop" size={20} />
                <span className="font-medium">Claude Desktop</span>
              </div>
              <div className="pt-3">
                {/* 接入方式：直连的供应商自己认 Claude 角色 ID；模型映射经本地路由 */}
                <div className="flex items-start justify-between gap-4 border-t pt-3">
                  <p className="min-w-0 flex-1 text-xs leading-relaxed text-fg-2">
                    {desktopMode === "direct"
                      ? t("claudeDesktop.modelMappingOffHint", {
                          defaultValue:
                            "仅当供应商直接接受 Claude Desktop 可识别的三档角色 ID（claude-sonnet-* / claude-opus-* / claude-haiku-*）时才适用直连；其他模型名（含 claude-3-5-sonnet-… 等旧式 ID）请选择模型映射。",
                        })
                      : t("claudeDesktop.modelMappingOnHint", {
                          defaultValue:
                            "Claude Desktop 只接受 claude-sonnet-* / claude-opus-* / claude-haiku-* 三档角色 ID。选择模型映射后，CC Switch 会把这三档映射到供应商的实际模型，并在使用期间保持本地路由开启。",
                        })}
                  </p>
                  <div className="flex shrink-0 items-center gap-2 border-l border-border pl-4">
                    <Label
                      htmlFor="desktop-model-mode"
                      className="text-sm font-normal text-fg-2"
                    >
                      {t("claudeDesktop.modelModeLabel", {
                        defaultValue: "接入方式",
                      })}
                    </Label>
                    <Select
                      value={desktopMode}
                      onValueChange={(value) => {
                        setDesktopMode(value as ClaudeDesktopMode);
                        setDesktopRoutes([]);
                      }}
                    >
                      <SelectTrigger
                        id="desktop-model-mode"
                        className="w-[156px]"
                        aria-label={t("claudeDesktop.modelModeLabel", {
                          defaultValue: "接入方式",
                        })}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="direct">
                          {t("claudeDesktop.modelModeDirect", {
                            defaultValue: "直连",
                          })}
                        </SelectItem>
                        <SelectItem value="proxy">
                          {t("claudeDesktop.modelModeProxy", {
                            defaultValue: "模型映射",
                          })}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {desktopMode === "proxy" && (
                  <div className="space-y-1 border-t pt-3">
                    <Label className="text-xs">
                      {t("providerForm.apiFormat", {
                        defaultValue: "上游格式",
                      })}
                    </Label>
                    <Select
                      value={models.claudeDesktop?.apiFormat || "anthropic"}
                      onValueChange={(value) =>
                        updateModel("claudeDesktop", "apiFormat", value)
                      }
                    >
                      <SelectTrigger className="w-full" aria-label="上游格式">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="anthropic">
                          {t("providerForm.apiFormatAnthropic", {
                            defaultValue: "Anthropic Messages (原生)",
                          })}
                        </SelectItem>
                        <SelectItem value="openai_chat">
                          {t("providerForm.apiFormatOpenAIChat", {
                            defaultValue:
                              "OpenAI Chat Completions (需开启路由)",
                          })}
                        </SelectItem>
                        <SelectItem value="openai_responses">
                          {t("providerForm.apiFormatOpenAIResponses", {
                            defaultValue: "OpenAI Responses API (需开启路由)",
                          })}
                        </SelectItem>
                        <SelectItem value="gemini_native">
                          {t("providerForm.apiFormatGeminiNative", {
                            defaultValue:
                              "Gemini Native generateContent (需开启路由)",
                          })}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* 路由表：映射模式固定四档角色，直连模式只填角色 ID */}
                <div className="space-y-2 border-t pt-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <Label className="text-xs">
                      {desktopMode === "proxy"
                        ? t("claudeDesktop.routeMapTitle", {
                            defaultValue: "模型映射",
                          })
                        : t("claudeDesktop.directModelListTitle", {
                            defaultValue: "模型列表",
                          })}
                    </Label>
                    {desktopMode === "direct" && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          setDesktopRoutes((prev) => [
                            ...prev,
                            {
                              routeId: "",
                              model: "",
                              labelOverride: "",
                              supports1m: false,
                            },
                          ])
                        }
                      >
                        {t("claudeDesktop.addModel", {
                          defaultValue: "添加模型",
                        })}
                      </Button>
                    )}
                  </div>
                  <p className="text-xs leading-relaxed text-fg-2">
                    {desktopMode === "proxy"
                      ? t("claudeDesktop.routeMapHint", {
                          defaultValue:
                            "为 Sonnet、Opus、Haiku 三档分别填写实际请求模型；菜单显示名可写 DeepSeek、Kimi 等品牌名。留空的档会自动沿用 Sonnet（或第一个已填档）的模型，确保子 agent 调用的 Haiku 始终可用。",
                        })
                      : t("claudeDesktop.directModelListHint", {
                          defaultValue:
                            "配置 Claude Desktop 可用的 Sonnet、Opus、Haiku 模型。留空时 Claude Desktop 会自动读取 /v1/models；勾选 1M 会声明支持 1M 上下文。",
                        })}
                  </p>

                  {desktopMode === "proxy" && (
                    <div className="hidden grid-cols-[140px_1fr_1fr_116px] gap-2 px-1 text-xs font-medium text-fg-2 md:grid">
                      <span>
                        {t("claudeDesktop.routeModelLabel", {
                          defaultValue: "模型角色",
                        })}
                      </span>
                      <span>
                        {t("claudeDesktop.labelOverrideLabel", {
                          defaultValue: "菜单显示名",
                        })}
                      </span>
                      <span>
                        {t("claudeDesktop.upstreamModelLabel", {
                          defaultValue: "实际请求模型",
                        })}
                      </span>
                      <span>
                        {t("claudeDesktop.supports1mLabel", {
                          defaultValue: "声明支持 1M",
                        })}
                      </span>
                    </div>
                  )}

                  <div className="space-y-2">
                    {desktopRoutes.map((row, index) => (
                      <div
                        key={`${row.routeId}-${index}`}
                        className={
                          desktopMode === "proxy"
                            ? "grid grid-cols-1 gap-2 md:grid-cols-[140px_1fr_1fr_116px]"
                            : "grid grid-cols-1 gap-2 md:grid-cols-[1fr_1fr_116px_36px]"
                        }
                      >
                        {desktopMode === "proxy" ? (
                          <div className="flex h-9 items-center rounded-md border border-input bg-subtle px-3 text-sm font-medium text-fg-2">
                            {desktopRoleLabel(row.routeId)}
                          </div>
                        ) : (
                          <Input
                            aria-label={t("claudeDesktop.routeModelLabel", {
                              defaultValue: "模型角色",
                            })}
                            value={row.routeId}
                            onChange={(e) =>
                              updateDesktopRoute(index, {
                                routeId: e.target.value,
                              })
                            }
                            placeholder="claude-sonnet-4-6"
                          />
                        )}
                        <Input
                          aria-label={t("claudeDesktop.labelOverrideLabel", {
                            defaultValue: "菜单显示名",
                          })}
                          value={row.labelOverride}
                          onChange={(e) =>
                            updateDesktopRoute(index, {
                              labelOverride: e.target.value,
                            })
                          }
                          placeholder="DeepSeek V4 Pro"
                        />
                        {desktopMode === "proxy" && (
                          <ModelSelect
                            models={availableModels}
                            value={row.model}
                            onChange={(value) =>
                              updateDesktopRoute(index, { model: value })
                            }
                            label={t("claudeDesktop.upstreamModelLabel", {
                              defaultValue: "实际请求模型",
                            })}
                          />
                        )}
                        <label className="flex h-9 items-center gap-2 text-sm text-fg-2">
                          <input
                            type="checkbox"
                            className="ui-checkbox"
                            checked={row.supports1m}
                            onChange={(e) =>
                              updateDesktopRoute(index, {
                                supports1m: e.target.checked,
                              })
                            }
                          />
                          {t("claudeDesktop.supports1mShort", {
                            defaultValue: "1M",
                          })}
                        </label>
                        {desktopMode === "direct" && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label={t("common.delete", {
                              defaultValue: "删除",
                            })}
                            onClick={() =>
                              setDesktopRoutes((prev) =>
                                prev.filter((_, i) => i !== index),
                              )
                            }
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
                {/* Claude Desktop JSON */}
                {claudeDesktopConfigJson && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <ProviderIcon
                        icon="claude"
                        name="Claude Desktop"
                        size={16}
                      />
                      Claude Desktop
                    </div>
                    <JsonEditor
                      value={JSON.stringify(claudeDesktopConfigJson, null, 2)}
                      onChange={() => {}}
                      height={280}
                      darkMode={isDarkMode}
                    />
                  </div>
                )}
              </div>
            </div>
            <div className="rounded-lg border p-3">
              <div className="flex items-center gap-2">
                <ProviderIcon icon="grok" name="Grok Build" size={20} />
                <span className="font-medium">Grok Build</span>
              </div>
              <div className="pt-3">
                <div className="grid gap-3 sm:grid-cols-2 border-t pt-3">
                  <div className="space-y-1">
                    <Label className="text-xs">
                      {t("universalProvider.grokProfile", {
                        defaultValue: "配置档位",
                      })}
                    </Label>
                    <ModelSelect
                      models={availableModels}
                      value={models.grokbuild?.model || ""}
                      onChange={(value) =>
                        updateModel("grokbuild", "model", value)
                      }
                      label={t("modelLabel", { defaultValue: "配置档位" })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">
                      {t("universalProvider.grokUpstreamModel", {
                        defaultValue: "上游模型",
                      })}
                    </Label>
                    <ModelSelect
                      models={availableModels}
                      value={models.grokbuild?.upstreamModel || ""}
                      onChange={(value) =>
                        updateModel("grokbuild", "upstreamModel", value)
                      }
                      label={t("universalProvider.grokUpstreamModel", {
                        defaultValue: "上游模型",
                      })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">
                      {t("universalProvider.apiBackend", {
                        defaultValue: "上游协议",
                      })}
                    </Label>
                    <Select
                      value={models.grokbuild?.apiBackend || "responses"}
                      onValueChange={(value) =>
                        updateModel("grokbuild", "apiBackend", value)
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="responses">Responses</SelectItem>
                        <SelectItem value="chat_completions">
                          Chat Completions
                        </SelectItem>
                        <SelectItem value="anthropic_messages">
                          Anthropic Messages
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">
                      {t("universalProvider.grokContextWindow", {
                        defaultValue: "上下文窗口",
                      })}
                    </Label>
                    <Input
                      inputMode="numeric"
                      value={models.grokbuild?.contextWindow?.toString() ?? ""}
                      onChange={(e) =>
                        updateModel(
                          "grokbuild",
                          "contextWindow",
                          e.target.value.replace(/\D/g, ""),
                        )
                      }
                      placeholder="500000"
                    />
                  </div>
                </div>
                {/* Grok Build TOML */}
                {grokbuildConfigJson && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <ProviderIcon icon="grok" name="Grok Build" size={16} />
                      Grok Build
                    </div>
                    <JsonEditor
                      value={grokbuildConfigJson.config}
                      onChange={() => {}}
                      height={280}
                      darkMode={isDarkMode}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
          <p className="text-xs text-fg-2">
            {t("universalProvider.allAppsHint", {
              defaultValue:
                "统一供应商会同步到全部五个应用。Claude Desktop 通过本地路由把三档角色模型映射到上游；Grok Build 按这里填写的模型与协议直连。",
            })}
          </p>
        </div>
      </form>

      {/* 端点测速：统一供应商只有一份地址，测速选中的地址写回 API 地址；
          自定义端点列表和「自动选择」存进 meta。appId 只用来选测速超时档位，
          取最宽松的 Codex 档（12s）——一份地址供所有应用用。 */}
      {isEndpointModalOpen && (
        <EndpointSpeedTest
          appId="codex"
          value={baseUrl}
          onChange={setBaseUrl}
          initialEndpoints={endpointCandidates}
          visible={isEndpointModalOpen}
          onClose={() => setIsEndpointModalOpen(false)}
          autoSelect={endpointAutoSelect}
          onAutoSelectChange={setEndpointAutoSelect}
          onCustomEndpointsChange={setDraftCustomEndpoints}
        />
      )}

      {/* 保存并同步确认弹窗 */}
      <ConfirmDialog
        isOpen={syncConfirmOpen}
        title={t("universalProvider.syncConfirmTitle", {
          defaultValue: "同步统一供应商",
        })}
        message={t("universalProvider.syncConfirmDescription", {
          defaultValue: `同步 "${name}" 将会覆盖 Claude Code、Claude Desktop、Codex、Gemini CLI 和 Grok Build 中关联的供应商配置。确定要继续吗？`,
          name: name,
        })}
        confirmText={t("universalProvider.saveAndSync", {
          defaultValue: "保存并同步",
        })}
        onConfirm={confirmSaveAndSync}
        onCancel={() => {
          setSyncConfirmOpen(false);
          setPendingProvider(null);
        }}
      />
    </FullScreenPanel>
  );
}
