import { describe, expect, it } from "vitest";
import type { FixSuggestion } from "../domain/types";
import { buildFixPreview, confirmationRequired, executableCommand } from "./fixes";
import { validateFixRequest, validateProjectPath } from "./paths";

const install: FixSuggestion = {
  id: "npm-install",
  label: "Install with npm",
  kind: "execute",
  action: "npm-install",
  commandText: "rm -rf /",
  whatChanges: "Install dependencies.",
  sideEffects: "Creates node_modules.",
};

describe("fix confirmation and path allowlisting", () => {
  it("requires confirmation before an install and ignores injected command text", () => {
    expect(confirmationRequired(install)).toBe(true);
    const preview = buildFixPreview(install, "/Users/ada/app");
    expect(preview.requiresConfirmation).toBe(true);
    expect(preview.executable).toBe(true);
    expect(preview.operation).toBe(executableCommand("npm-install").command);
    expect(preview.operation).not.toContain("rm");
  });

  it("does not execute copy or documentation actions", () => {
    const copy = buildFixPreview(
      {
        id: "copy",
        label: "Copy",
        kind: "copy",
        commandText: "git status",
        whatChanges: "Clipboard only.",
        sideEffects: "None.",
      },
      "/Users/ada/app",
    );
    expect(copy.executable).toBe(false);
    expect(copy.requiresConfirmation).toBe(false);
  });

  it("rejects destructive and unknown actions", () => {
    expect(validateFixRequest("rm", "/Users/ada/app").ok).toBe(false);
    expect(validateFixRequest("npm-install && rm -rf /", "/Users/ada/app").ok).toBe(false);
    expect(validateFixRequest("git reset --hard", "/Users/ada/app").ok).toBe(false);
    const preview = buildFixPreview({ ...install, action: undefined }, "/Users/ada/app");
    expect(preview.executable).toBe(false);
    expect(preview.blockedReason).toMatch(/allowlisted/i);
  });

  it("rejects unsafe paths", () => {
    expect(validateProjectPath("relative/app").ok).toBe(false);
    expect(validateProjectPath("/Users/ada/../etc").ok).toBe(false);
    expect(validateProjectPath("/usr/local/app").ok).toBe(false);
    expect(validateProjectPath("/").ok).toBe(false);
    expect(validateProjectPath("/Users/ada/app; rm -rf /").ok).toBe(false);
    expect(validateProjectPath("/tmp/dev\0").ok).toBe(false);
    expect(validateFixRequest("npm-install", "/opt/system/app").ok).toBe(false);
    expect(validateProjectPath("/Users/ada/My App").ok).toBe(true);
  });

  it("uses the pnpm allowlisted command", () => {
    expect(executableCommand("pnpm-install")).toEqual({
      command: "pnpm install --ignore-scripts",
      args: ["install", "--ignore-scripts"],
    });
  });
});
