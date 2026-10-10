import { describe, expect, it } from "vitest";
import { classifyArtifact } from "./artifacts";

const base = {
  relativePath: "dist",
  name: "dist",
  kind: "directory" as const,
  bytes: 120,
  modifiedMs: 1,
  truncated: false,
  missing: false,
  markers: ["package.json"],
  branch: null,
  lastCommitMs: null,
};

describe("classifyArtifact", () => {
  it("treats dist as generated build output", () => {
    const item = classifyArtifact(base);
    expect(item?.safety).toBe("generated");
    expect(item?.category).toBe("build-output");
  });

  it("treats node_modules as reproducible", () => {
    const item = classifyArtifact({ ...base, name: "node_modules", relativePath: "node_modules" });
    expect(item?.safety).toBe("reproducible");
    expect(item?.consequence).toMatch(/installed again/i);
  });

  it("does not treat a bare target directory as rust output", () => {
    const item = classifyArtifact({ ...base, name: "target", relativePath: "target", markers: [] });
    expect(item?.safety).toBe("uncertain");
  });

  it("treats target beside Cargo.toml as generated", () => {
    const item = classifyArtifact({ ...base, name: "target", relativePath: "target", markers: ["Cargo.toml"] });
    expect(item?.safety).toBe("generated");
    expect(item?.technologies).toContain("Rust");
  });

  it("does not classify an unknown directory", () => {
    expect(classifyArtifact({ ...base, name: "src", relativePath: "src" })).toBeNull();
  });

  it("keeps tmp uncertain even when it is old", () => {
    const item = classifyArtifact({ ...base, name: "tmp", relativePath: "tmp", modifiedMs: 0 });
    expect(item?.safety).toBe("uncertain");
    expect(item?.reason).toMatch(/age was not used/i);
  });

  it("keeps a worktree uncertain and out of the generated total", () => {
    const item = classifyArtifact({
      ...base,
      kind: "worktree",
      name: "feature",
      relativePath: "/tmp/feature",
      branch: "feature",
      bytes: 40,
    });
    expect(item?.category).toBe("worktree");
    expect(item?.safety).toBe("uncertain");
    expect(item?.countsInTotal).toBe(false);
    expect(item?.reason).toMatch(/age was not used/i);
  });

  it("treats pycache next to a python file as generated", () => {
    const item = classifyArtifact({
      ...base,
      name: "__pycache__",
      relativePath: "pkg/__pycache__",
      markers: ["*.py"],
    });
    expect(item?.safety).toBe("generated");
    expect(item?.technologies).toContain("Python");
  });

  it("keeps a generic cache uncertain even beside a project file", () => {
    const item = classifyArtifact({ ...base, name: ".cache", relativePath: ".cache", markers: ["package.json"] });
    expect(item?.safety).toBe("uncertain");
    expect(item?.reason).toMatch(/not inspected/i);
  });

  it("omits a bin directory that has no .NET project file", () => {
    expect(classifyArtifact({ ...base, name: "bin", relativePath: "bin", markers: ["package.json"] })).toBeNull();
  });

  it("treats bin beside a csproj as generated", () => {
    const item = classifyArtifact({ ...base, name: "bin", relativePath: "bin", markers: ["*.csproj"] });
    expect(item?.safety).toBe("generated");
    expect(item?.technologies).toContain(".NET");
  });

  it("treats vendor beside composer.json as reproducible", () => {
    const item = classifyArtifact({ ...base, name: "vendor", relativePath: "vendor", markers: ["composer.json"] });
    expect(item?.safety).toBe("reproducible");
    expect(item?.technologies).toContain("PHP Composer");
  });

  it("matches gradle caches by relative path", () => {
    const item = classifyArtifact({
      ...base,
      name: "caches",
      relativePath: "android/.gradle/caches",
      markers: ["build.gradle"],
    });
    expect(item?.category).toBe("cache");
    expect(item?.technologies).toContain("Gradle");
  });

  it("lists an unused branch without a measured size", () => {
    const item = classifyArtifact({
      ...base,
      kind: "branch",
      name: "old",
      relativePath: "old",
      branch: "old",
      bytes: null,
      lastCommitMs: 20,
    });
    expect(item?.category).toBe("branch");
    expect(item?.safety).toBe("uncertain");
    expect(item?.bytes).toBeNull();
    expect(item?.consequence).toMatch(/not offered/i);
  });
});
