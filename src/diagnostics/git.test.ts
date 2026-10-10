import { describe, expect, it } from "vitest";
import { parseGitPorcelain } from "./git";

describe("parseGitPorcelain", () => {
  it("treats an empty status as a clean tree", () => {
    expect(parseGitPorcelain("").dirty).toBe(false);
    expect(parseGitPorcelain("\n").entries).toEqual([]);
  });

  it("parses modified and untracked paths", () => {
    const parsed = parseGitPorcelain(" M src/index.ts\n?? notes.txt\n");
    expect(parsed.dirty).toBe(true);
    expect(parsed.entries).toEqual([
      { code: " M", path: "src/index.ts" },
      { code: "??", path: "notes.txt" },
    ]);
  });

  it("keeps rename targets in the path text", () => {
    const parsed = parseGitPorcelain("R  old.ts -> new.ts\n");
    expect(parsed.entries[0]).toEqual({ code: "R ", path: "old.ts -> new.ts" });
  });
});
