import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslation } from "react-i18next";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import JsonEditor from "@/components/JsonEditor";
import { useDarkMode } from "@/hooks/useDarkMode";
import { providerSchema, type ProviderFormData } from "@/lib/schemas/provider";
import {
  buildLocalProxyRequestOverrides,
  formatRequestOverrideObject,
} from "@/lib/requestOverrides";
import type {
  ClaudeApiKeyField,
  CodexApiFormat,
  CodexChatReasoning,
  PromptCacheRoutingMode,
  ProviderCategory,
  ProviderMeta,
} from "@/types";
import type { ProviderFormProps, ProviderFormValues } from "./ProviderForm";
import { BasicFormFields } from "./BasicFormFields";
import { CodexFormFields } from "./CodexFormFields";
import { InactiveFieldsPanel } from "./InactiveFieldsPanel";
import {
  buildGrokBuildConfig,
  GROK_BUILD_DEFAULT_API_BACKEND,
  parseGrokBuildConfig,
  updateGrokBuildConfig,
  validateGrokBuildConfig,
} from "@/utils/grokBuildConfig";
import { resolveProviderIcon } from "@/utils/providerIcon";
import { useDraftEditorProjection } from "./hooks/useDraftEditorProjection";

type GrokBuildProviderFormProps = Omit<ProviderFormProps, "appId">;

export function GrokBuildProviderForm({
  providerId,
  submitLabel,
  onSubmit,
  onCancel,
  onSubmittingChange,
  initialData,
  showButtons = true,
  inactiveFields = [],
  onEditorBaseChange,
}: GrokBuildProviderFormProps) {
  const { t } = useTranslation();
  const isDarkMode = useDarkMode();
  const initialConfigText =
    typeof initialData?.settingsConfig?.config === "string"
      ? initialData.settingsConfig.config
      : undefined;
  const initialConfig = useMemo(
    () => parseGrokBuildConfig(initialConfigText, initialData?.name),
    [initialConfigText, initialData?.name],
  );

  const [category] = useState<ProviderCategory | undefined>(
    initialData?.category ?? "custom",
  );
  const [profile, setProfile] = useState(initialConfig.model);
  const [upstreamModel, setUpstreamModel] = useState(
    initialConfig.upstreamModel ?? initialConfig.model,
  );
  const [baseUrl, setBaseUrl] = useState(initialConfig.baseUrl);
  const [apiKey, setApiKey] = useState(initialConfig.apiKey);
  const [contextWindow, setContextWindow] = useState(
    String(initialConfig.contextWindow),
  );
  const [rawConfig, setRawConfig] = useState(
    initialConfigText ?? buildGrokBuildConfig(initialConfig),
  );

  // 新增：模板投影到当前 config.toml 上显示。每次重置显示内容都要重新投影（或作废
  // 投影），否则保存时三方比较的底和显示内容对不上。
  const { projectDraft } = useDraftEditorProjection(
    "grokbuild",
    onEditorBaseChange,
  );
  const projectGrokDraft = (config: string) =>
    projectDraft({ config }, category, (shown) =>
      setRawConfig(typeof shown.config === "string" ? shown.config : config),
    );
  useEffect(() => {
    if (!initialData) projectGrokDraft(rawConfig);
    // 只在打开时投影一次：之后的投影跟着编辑内容走。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [apiFormat, setApiFormat] = useState<CodexApiFormat>(
    (initialData?.meta?.apiFormat as CodexApiFormat | undefined) ??
      "openai_responses",
  );
  const [anthropicAuthField, setAnthropicAuthField] =
    useState<ClaudeApiKeyField>(
      initialData?.meta?.apiKeyField ?? "ANTHROPIC_AUTH_TOKEN",
    );
  const [impersonateClaudeCode, setImpersonateClaudeCode] = useState(
    initialData?.meta?.impersonateClaudeCode === true,
  );
  const [maxOutputTokens, setMaxOutputTokens] = useState(
    initialData?.meta?.maxOutputTokens
      ? String(initialData.meta.maxOutputTokens)
      : "",
  );
  const [codexChatReasoning, setCodexChatReasoning] =
    useState<CodexChatReasoning>(initialData?.meta?.codexChatReasoning ?? {});
  const [promptCacheRouting, setPromptCacheRouting] =
    useState<PromptCacheRoutingMode>(
      initialData?.meta?.promptCacheRouting ?? "auto",
    );
  const [isFullUrl, setIsFullUrl] = useState(
    initialData?.meta?.isFullUrl ?? false,
  );
  const [customUserAgent, setCustomUserAgent] = useState(
    initialData?.meta?.customUserAgent ?? "",
  );
  const [headersOverride, setHeadersOverride] = useState(
    formatRequestOverrideObject(
      initialData?.meta?.localProxyRequestOverrides?.headers,
    ),
  );
  const [bodyOverride, setBodyOverride] = useState(
    formatRequestOverrideObject(
      initialData?.meta?.localProxyRequestOverrides?.body,
    ),
  );
  const [endpointAutoSelect, setEndpointAutoSelect] = useState(
    initialData?.meta?.endpointAutoSelect ?? true,
  );
  const [isEndpointModalOpen, setIsEndpointModalOpen] = useState(false);
  const [draftCustomEndpoints, setDraftCustomEndpoints] = useState<string[]>(
    [],
  );

  const form = useForm<ProviderFormData>({
    resolver: zodResolver(providerSchema),
    defaultValues: {
      name: initialData?.name ?? initialConfig.name,
      websiteUrl: initialData?.websiteUrl ?? "",
      notes: initialData?.notes ?? "",
      settingsConfig: JSON.stringify({ config: rawConfig }),
      icon:
        resolveProviderIcon(
          "grokbuild",
          initialData?.icon,
          initialData?.iconColor,
        ) ?? "",
      iconColor: initialData?.iconColor ?? "",
    },
    mode: "onSubmit",
  });
  const { isSubmitting } = form.formState;
  const websiteUrl = form.watch("websiteUrl") ?? "";
  // 「获取 API Key」直接用表单里填的官网地址
  const apiKeyLinkUrl = websiteUrl;

  useEffect(() => {
    onSubmittingChange?.(isSubmitting);
  }, [isSubmitting, onSubmittingChange]);

  const speedTestEndpoints = useMemo(() => {
    const urls = new Set<string>();
    const add = (url?: string) => {
      const normalized = url?.trim().replace(/\/+$/, "");
      if (normalized) urls.add(normalized);
    };
    add(baseUrl);
    draftCustomEndpoints.forEach(add);
    return Array.from(urls).map((url) => ({ url }));
  }, [baseUrl, draftCustomEndpoints]);

  const syncStructuredConfig = (
    overrides: Partial<ReturnType<typeof parseGrokBuildConfig>>,
  ) => {
    const next = {
      model: profile,
      upstreamModel,
      baseUrl,
      name: form.getValues("name") || initialConfig.name,
      apiKey,
      contextWindow: Number.parseInt(contextWindow, 10),
      ...overrides,
      apiBackend: GROK_BUILD_DEFAULT_API_BACKEND,
    };
    setRawConfig((current) => updateGrokBuildConfig(current, next));
  };

  const handleRawConfigChange = (value: string) => {
    setRawConfig(value);
    if (validateGrokBuildConfig(value)) return;
    const parsed = parseGrokBuildConfig(value, form.getValues("name"));
    setProfile(parsed.model);
    setUpstreamModel(parsed.upstreamModel ?? parsed.model);
    setBaseUrl(parsed.baseUrl);
    setApiKey(parsed.apiKey);
    setContextWindow(String(parsed.contextWindow));
    if (parsed.name) form.setValue("name", parsed.name);
  };

  const handleSubmit = async (values: ProviderFormData) => {
    const name = values.name.trim();

    // 官方条目：config 快照原样透传（新增时为空），不做自定义模型字段校验，
    // 也不重建 config —— 新增走 ensure seed，编辑只允许改名称/图标等元信息。
    if (category === "official") {
      await onSubmit({
        ...values,
        name,
        websiteUrl: values.websiteUrl?.trim() ?? "",
        notes: values.notes?.trim() ?? "",
        settingsConfig: JSON.stringify({ config: rawConfig }),
        presetCategory: "official",
        meta: initialData?.meta,
      });
      return;
    }

    const parsedContextWindow = Number.parseInt(contextWindow, 10);
    const envKey = parseGrokBuildConfig(rawConfig).envKey?.trim();
    if (
      !name ||
      !baseUrl.trim() ||
      (!apiKey.trim() && !envKey) ||
      !profile.trim()
    ) {
      toast.error(
        t("providerForm.requiredFields", {
          defaultValue: "请填写供应商名称、API 地址、API Key 和模型",
        }),
      );
      return;
    }
    if (!Number.isInteger(parsedContextWindow) || parsedContextWindow <= 0) {
      toast.error(
        t("grokBuild.contextWindowInvalid", {
          defaultValue: "上下文窗口必须是正整数",
        }),
      );
      return;
    }

    const finalConfig = updateGrokBuildConfig(rawConfig, {
      model: profile,
      upstreamModel,
      baseUrl,
      name,
      apiKey,
      apiBackend: GROK_BUILD_DEFAULT_API_BACKEND,
      contextWindow: parsedContextWindow,
    });
    const configError = validateGrokBuildConfig(finalConfig);
    if (configError) {
      toast.error(
        t("grokBuild.invalidToml", {
          error: configError,
          defaultValue: `config.toml 格式错误: ${configError}`,
        }),
      );
      return;
    }

    const requestOverrides = buildLocalProxyRequestOverrides(
      headersOverride,
      bodyOverride,
    );
    if (requestOverrides.error) {
      toast.error(requestOverrides.error);
      return;
    }

    const customEndpoints = Object.fromEntries(
      draftCustomEndpoints.map((url) => [
        url,
        { url, addedAt: Date.now(), lastUsed: undefined },
      ]),
    );
    const parsedMaxOutputTokens = Number.parseInt(maxOutputTokens, 10);
    const initialMeta = { ...(initialData?.meta ?? {}) };
    delete initialMeta.custom_endpoints;
    const meta: ProviderMeta = {
      ...initialMeta,
      apiFormat,
      apiKeyField: anthropicAuthField,
      isFullUrl,
      endpointAutoSelect,
      impersonateClaudeCode,
      promptCacheRouting,
      codexChatReasoning,
      customUserAgent: customUserAgent.trim() || undefined,
      localProxyRequestOverrides: requestOverrides.overrides,
      maxOutputTokens:
        Number.isInteger(parsedMaxOutputTokens) && parsedMaxOutputTokens > 0
          ? parsedMaxOutputTokens
          : undefined,
    };
    if (!providerId && Object.keys(customEndpoints).length > 0) {
      meta.custom_endpoints = customEndpoints;
    }
    const payload: ProviderFormValues = {
      ...values,
      name,
      websiteUrl: values.websiteUrl?.trim() ?? "",
      notes: values.notes?.trim() ?? "",
      settingsConfig: JSON.stringify({ config: finalConfig }),
      presetCategory: category ?? "custom",
      meta,
    };

    await onSubmit(payload);
  };

  const rawConfigError = validateGrokBuildConfig(rawConfig);

  return (
    <Form {...form}>
      <form
        id="provider-form"
        onSubmit={form.handleSubmit(handleSubmit)}
        className="space-y-6"
      >
        <BasicFormFields form={form} />

        {category !== "official" && (
          <>
            <CodexFormFields
              appId="grokbuild"
              providerId={providerId}
              codexApiKey={apiKey}
              onApiKeyChange={(value) => {
                setApiKey(value);
                syncStructuredConfig({ apiKey: value });
              }}
              category={category}
              shouldShowApiKeyLink={Boolean(apiKeyLinkUrl)}
              websiteUrl={apiKeyLinkUrl}
              shouldShowSpeedTest
              codexBaseUrl={baseUrl}
              onBaseUrlChange={(value) => {
                setBaseUrl(value);
                syncStructuredConfig({ baseUrl: value });
              }}
              isFullUrl={isFullUrl}
              onFullUrlChange={setIsFullUrl}
              isEndpointModalOpen={isEndpointModalOpen}
              onEndpointModalToggle={setIsEndpointModalOpen}
              onCustomEndpointsChange={setDraftCustomEndpoints}
              autoSelect={endpointAutoSelect}
              onAutoSelectChange={setEndpointAutoSelect}
              codexModel={upstreamModel}
              onModelChange={(value) => {
                setUpstreamModel(value);
                syncStructuredConfig({ upstreamModel: value });
              }}
              apiFormat={apiFormat}
              onApiFormatChange={(value) => {
                setApiFormat(value);
              }}
              anthropicAuthField={anthropicAuthField}
              onAnthropicAuthFieldChange={setAnthropicAuthField}
              impersonateClaudeCode={impersonateClaudeCode}
              onImpersonateClaudeCodeChange={setImpersonateClaudeCode}
              maxOutputTokens={maxOutputTokens}
              onMaxOutputTokensChange={setMaxOutputTokens}
              codexChatReasoning={codexChatReasoning}
              onCodexChatReasoningChange={setCodexChatReasoning}
              promptCacheRouting={promptCacheRouting}
              onPromptCacheRoutingChange={setPromptCacheRouting}
              speedTestEndpoints={speedTestEndpoints}
              customUserAgent={customUserAgent}
              onCustomUserAgentChange={setCustomUserAgent}
              localProxyHeadersOverride={headersOverride}
              onLocalProxyHeadersOverrideChange={setHeadersOverride}
              localProxyBodyOverride={bodyOverride}
              onLocalProxyBodyOverrideChange={setBodyOverride}
            />

            <FormItem>
              <FormLabel htmlFor="grokbuild-context-window">
                {t("grokBuild.contextWindow", { defaultValue: "上下文窗口" })}
              </FormLabel>
              <Input
                id="grokbuild-context-window"
                type="number"
                min={1}
                step={1}
                inputMode="numeric"
                value={contextWindow}
                onChange={(event) => {
                  const value = event.target.value;
                  setContextWindow(value);
                  syncStructuredConfig({
                    contextWindow: Number.parseInt(value, 10),
                  });
                }}
              />
            </FormItem>

            <div className="space-y-2">
              <FormLabel htmlFor="grokbuild-config-toml">
                {t("grokBuild.rawConfig", { defaultValue: "config.toml" })}
              </FormLabel>
              <p className="text-xs text-fg-2">
                {t("grokBuild.keyFieldsHint", {
                  defaultValue:
                    "默认模型（models.default）和它指向的模型表随供应商切换；其余是 Grok Build 全局设置，保存后对所有供应商生效。",
                })}
              </p>
              <JsonEditor
                value={rawConfig}
                onChange={handleRawConfigChange}
                placeholder=""
                darkMode={isDarkMode}
                rows={3}
                showValidation={false}
                language="javascript"
              />
              {rawConfigError && (
                <p className="text-xs text-destructive">
                  {t("grokBuild.invalidToml", {
                    error: rawConfigError,
                    defaultValue: `Invalid config.toml: ${rawConfigError}`,
                  })}
                </p>
              )}
              <InactiveFieldsPanel
                fields={inactiveFields}
                hint={t("grokBuild.inactiveFieldsHint", {
                  count: inactiveFields.length,
                  defaultValue:
                    "这个供应商还保存着 {{count}} 个不随切换生效的设置。点击复制它的 TOML，按需粘贴到上方；供应商里保存的原值不会删除。",
                })}
                action={{
                  kind: "copy",
                  copiedText: t("grokBuild.inactiveFieldCopied", {
                    defaultValue: "已复制",
                  }),
                }}
              />
            </div>
          </>
        )}

        <FormField
          control={form.control}
          name="settingsConfig"
          render={() => (
            <FormItem className="hidden">
              <FormControl>
                <Input type="hidden" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {showButtons && (
          <div className="flex justify-end gap-2">
            <Button variant="outline" type="button" onClick={onCancel}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {submitLabel}
            </Button>
          </div>
        )}
      </form>
    </Form>
  );
}
