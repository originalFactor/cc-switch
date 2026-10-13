import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AvailableModelsEditor } from "@/components/universal/AvailableModelsEditor";
import type { AvailableModel } from "@/types";

const models: AvailableModel[] = [
  { id: "gpt-5.6-sol", displayName: "GPT-5.6 Sol", contextWindow: 1000000 },
  { id: "glm-5.3" },
];

const setup = (
  over: Partial<React.ComponentProps<typeof AvailableModelsEditor>> = {},
) => {
  const onChange = vi.fn();
  const onRefresh = vi.fn();
  render(
    <AvailableModelsEditor
      models={models}
      onChange={onChange}
      onRefresh={onRefresh}
      {...over}
    />,
  );
  return { onChange, onRefresh };
};

describe("AvailableModelsEditor", () => {
  it("把列表显示成可编辑的行", () => {
    setup();
    expect(screen.getByDisplayValue("gpt-5.6-sol")).toBeInTheDocument();
    expect(screen.getByDisplayValue("GPT-5.6 Sol")).toBeInTheDocument();
    expect(screen.getByDisplayValue("1000000")).toBeInTheDocument();
  });

  it("改显示名会回传改过的列表", async () => {
    const user = userEvent.setup();
    const seen: AvailableModel[][] = [];
    // 受控组件：真实用法里父级会把新列表传回来，这里同样用一个有状态的包装
    const Wrapper = () => {
      const [list, setList] = useState<AvailableModel[]>(models);
      return (
        <AvailableModelsEditor
          models={list}
          onChange={(next) => {
            seen.push(next);
            setList(next);
          }}
          onRefresh={vi.fn()}
        />
      );
    };
    render(<Wrapper />);
    const name = screen.getByDisplayValue("GPT-5.6 Sol");
    await user.clear(name);
    await user.type(name, "Sol");
    const last = seen.at(-1)!;
    expect(last[0].displayName).toBe("Sol");
    // 其他行不受影响
    expect(last[1]).toEqual({ id: "glm-5.3" });
  });

  it("删除一行", async () => {
    const user = userEvent.setup();
    const { onChange } = setup();
    await user.click(screen.getByRole("button", { name: "删除 gpt-5.6-sol" }));
    expect(onChange).toHaveBeenCalledWith([{ id: "glm-5.3" }]);
  });

  it("手动添加一行空行", async () => {
    const user = userEvent.setup();
    const { onChange } = setup();
    await user.click(screen.getByRole("button", { name: /手动添加/ }));
    const last = onChange.mock.calls.at(-1)![0] as AvailableModel[];
    expect(last).toHaveLength(3);
    expect(last[2].id).toBe("");
  });

  it("清空 id 等于删掉这一行", async () => {
    const user = userEvent.setup();
    const { onChange } = setup();
    const idInput = screen.getByDisplayValue("glm-5.3");
    await user.clear(idInput);
    await user.tab();
    expect(onChange).toHaveBeenCalledWith([
      { id: "gpt-5.6-sol", displayName: "GPT-5.6 Sol", contextWindow: 1000000 },
    ]);
  });

  it("改过之后可以恢复到上次拉取的列表", async () => {
    const user = userEvent.setup();
    const fetched: AvailableModel[] = [{ id: "fetched-only" }];
    const { onChange } = setup({ fetched });
    await user.click(
      screen.getByRole("button", { name: /恢复为上次拉取的结果/ }),
    );
    expect(onChange).toHaveBeenCalledWith(fetched);
  });

  it("没有拉取过时不显示恢复按钮", () => {
    setup();
    expect(screen.queryByRole("button", { name: /恢复/ })).toBeNull();
  });

  it("新增的空行不参与 save 时的落库（由表单过滤）", async () => {
    // 这里只保证空行的 id 确实为空，表单保存时会把它剔掉
    const user = userEvent.setup();
    const { onChange } = setup();
    await user.click(screen.getByRole("button", { name: /手动添加/ }));
    const last = onChange.mock.calls.at(-1)![0] as AvailableModel[];
    expect(last.at(-1)!.id).toBe("");
  });

  it("空列表给出提示，拉取按钮可用", () => {
    setup({ models: [] });
    expect(screen.getByText(/还没有模型/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /获取模型列表/ })).toBeEnabled();
  });
});
