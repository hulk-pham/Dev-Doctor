import { describe, expect, it } from "vitest";
import { detectLockfiles } from "./lockfile";

describe("detectLockfiles", () => {
  it("detects npm from package-lock.json", () => {
    const result = detectLockfiles(["package-lock.json", "README.md"]);
    expect(result.primary).toBe("npm");
    expect(result.inconsistent).toBe(false);
    expect(result.lockfiles).toEqual(["package-lock.json"]);
  });

  it("treats npm lockfiles as one manager", () => {
    const result = detectLockfiles(["package-lock.json", "npm-shrinkwrap.json"]);
    expect(result.managers).toEqual(["npm"]);
    expect(result.inconsistent).toBe(false);
  });

  it("flags multiple package managers", () => {
    const result = detectLockfiles(["package-lock.json", "pnpm-lock.yaml", "yarn.lock"]);
    expect(result.inconsistent).toBe(true);
    expect(result.primary).toBeNull();
    expect(result.managers).toEqual(["npm", "pnpm", "yarn"]);
  });

  it("detects pnpm, yarn, and bun", () => {
    expect(detectLockfiles(["pnpm-lock.yaml"]).primary).toBe("pnpm");
    expect(detectLockfiles(["yarn.lock"]).primary).toBe("yarn");
    expect(detectLockfiles(["bun.lockb"]).primary).toBe("bun");
  });

  it("returns no manager when no lockfile exists", () => {
    const result = detectLockfiles([]);
    expect(result.primary).toBeNull();
    expect(result.inconsistent).toBe(false);
  });
});
