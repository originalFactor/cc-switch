/**
 * 新增对话框：Codex、Gemini CLI、Grok Build 的表单把模板投影到当前配置文件上显示，
 * 投影结果就是保存时三方比较的底。锁定一条不变式：每次重置显示内容之后，编辑框里的内容
 * 和最后上报的底一致。对不上时，底里有、显示里没有的全局设置会在保存时被当成删除写进
 * 配置文件。
 *
 * MSW 替身：投影在原内容上加一份「配置文件里已有的全局设置」，模拟真实的 live。
 */
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProviderForm } from "@/components/providers/forms/ProviderForm";
import type { AppId } from "@/lib/api";
import { server } from "../msw/server";
import { createTestQueryClient } from "../utils/testQueryClient";

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

vi.mock("@/components/providers/forms/CodexOAuthSection", () => ({
  CodexOAuthSection: () => <div data-testid="codex-oauth-section" />,
}));

vi.mock("@/components/providers/forms/hooks", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/components/providers/forms/hooks")>();
  return {
    ...actual,
    useCopilotAuth: () => ({
      isAuthenticated: false,
      isStatusSuccess: true,
      isStatusError: false,
      accounts: [],
    }),
    useCodexOauth: () => ({
      isAuthenticated: false,
      isStatusSuccess: true,
      isStatusError: false,
      defaultAccountId: null,
      accounts: [],
    }),
    useXaiOauth: () => ({ isAuthenticated: false, accounts: [] }),
  };
});

const LIVE_TOML = '\n[ui]\ntheme = "dark"\n';

type Base = Record<string, unknown> | null;

function projectAsLive() {
  server.use(
    http.post(
      "http://tauri.local/get_provider_editor_view",
      async ({ request }) => {
        const { app, settingsConfig = {} } = (await request.json()) as {
          app: AppId;
          settingsConfig?: Record<string, unknown>;
        };
        const settings = { ...settingsConfig };
        if (app === "gemini") {
          settings.env = {
            ...(settingsConfig.env as Record<string, unknown>),
            GEMINI_SANDBOX: "docker",
          };
          settings.config = {
            ...(settingsConfig.config as Record<string, unknown>),
            ui: { theme: "dark" },
          };
        } else {
          settings.config = `${String(settingsConfig.config ?? "")}${LIVE_TOML}`;
        }
        return HttpResponse.json({ settings, inactive: [] });
      },
    ),
  );
}

function renderForm(appId: AppId, bases: Base[]) {
  return render(
    <QueryClientProvider client={createTestQueryClient()}>
      <ProviderForm
        appId={appId}
        submitLabel="save"
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
        onEditorBaseChange={(base) => bases.push(base)}
      />
    </QueryClientProvider>,
  );
}

function editorTexts(): string[] {
  return screen
    .getAllByTestId("json-editor")
    .map((node) => (node as HTMLTextAreaElement).value);
}

/** 等到最后一次上报的底不为空，并且和上一次检查时不同。 */
async function nextBase(bases: Base[], seen: number): Promise<Base> {
  await waitFor(() => {
    expect(bases.length).toBeGreaterThan(seen);
    expect(bases.at(-1)).not.toBeNull();
  });
  return bases.at(-1)!;
}

describe("新增对话框的草稿投影", () => {
  beforeEach(() => {
    projectAsLive();
  });

  it.each(["codex", "gemini", "grokbuild"] as const)(
    "%s：打开时把模板投影到 live 上，显示内容等于底",
    async (appId) => {
      const bases: Base[] = [];
      renderForm(appId, bases);

      const base = await nextBase(bases, 0);
      // gemini 的 config 是 JSON 对象，其余是 TOML 字符串：显示内容要和底一致
      const expectedText =
        typeof base!.config === "string"
          ? String(base!.config)
          : JSON.stringify(base!.config, null, 2);
      await waitFor(() => expect(editorTexts()).toContain(expectedText));
      // 底里带上了 live 的全局设置，说明投影确实发生了
      if (typeof base!.config === "string") {
        expect(String(base!.config)).toContain(LIVE_TOML.trim());
      } else {
        expect(base!.config).toMatchObject({ ui: { theme: "dark" } });
      }
    },
  );

  it("Gemini：投影保留 live 里的全局设置", async () => {
    const bases: Base[] = [];
    renderForm("gemini", bases);

    const base = await nextBase(bases, 0);
    expect((base!.env as Record<string, unknown>).GEMINI_SANDBOX).toBe(
      "docker",
    );
    await waitFor(() =>
      expect(
        editorTexts().some((text) => text.includes("GEMINI_SANDBOX=docker")),
      ).toBe(true),
    );
  });
});
