import type { ToolName } from "./useToolManagement";

// Audited against official installation docs, 2026-10-12.
// An npm package does not imply support for every other package manager.
export const UNINSTALL_METHODS = {
  npm: "npm",
  pnpm: "pnpm",
  bun: "bun",
  "brew-formula": "Homebrew (formula)",
  "brew-cask": "Homebrew (cask)",
};

export type UninstallMethod = keyof typeof UNINSTALL_METHODS;
export type UninstallEnvironment = "windows" | "macos" | "linux";

type UninstallCommand = {
  tool: ToolName;
  command: string;
  environments?: UninstallEnvironment[];
  variant?: string;
};

const COMMANDS: Record<UninstallMethod, UninstallCommand[]> = {
  npm: [
    { tool: "claude", command: "npm uninstall -g @anthropic-ai/claude-code" },
    { tool: "codex", command: "npm uninstall -g @openai/codex" },
    { tool: "gemini", command: "npm uninstall -g @google/gemini-cli" },
    { tool: "grok", command: "npm uninstall -g @xai-official/grok" },
  ],
  pnpm: [],
  bun: [],
  "brew-formula": [
    {
      tool: "gemini",
      command: "brew uninstall --formula gemini-cli",
      environments: ["macos", "linux"],
    },
  ],
  "brew-cask": [
    {
      tool: "claude",
      command: "brew uninstall --cask claude-code",
      environments: ["macos"],
      variant: "claude-code",
    },
    {
      tool: "claude",
      command: "brew uninstall --cask claude-code@latest",
      environments: ["macos"],
      variant: "claude-code@latest",
    },
    {
      tool: "codex",
      command: "brew uninstall --cask codex",
      environments: ["macos"],
    },
  ],
};

export function uninstallCommandsFor(
  method: UninstallMethod,
  environmentForTool: (tool: ToolName) => UninstallEnvironment | undefined,
) {
  return COMMANDS[method].filter(({ tool, environments }) => {
    const environment = environmentForTool(tool);
    return (
      !environments ||
      (environment !== undefined && environments.includes(environment))
    );
  });
}
