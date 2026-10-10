import { describe, expect, it } from "vitest";
import { compareNodeVersion } from "./version";

describe("compareNodeVersion", () => {
  it("accepts an installed version inside the range", () => {
    expect(compareNodeVersion("v20.11.0", ">=18")).toEqual({
      status: "satisfied",
      installed: "20.11.0",
      range: ">=18",
    });
  });

  it("reports a mismatch without inventing a passing result", () => {
    expect(compareNodeVersion("26.9.0", ">=18 <20")).toMatchObject({
      status: "unsatisfied",
      installed: "26.9.0",
    });
  });

  it("treats 18.x as a range", () => {
    expect(compareNodeVersion("v18.19.1", "18.x").status).toBe("satisfied");
    expect(compareNodeVersion("v20.0.0", "^18.0.0").status).toBe("unsatisfied");
  });

  it("reports uncertainty for ranges it cannot evaluate", () => {
    const result = compareNodeVersion("v20.11.0", "latest");
    expect(result.status).toBe("uncertain");
    if (result.status === "uncertain") {
      expect(result.reason).toMatch(/not a range/i);
    }
  });

  it("does not compare when Node.js is missing", () => {
    expect(compareNodeVersion(null, ">=20").status).toBe("uncertain");
  });

  it("reports no requirement when engines.node is absent", () => {
    expect(compareNodeVersion("v20.11.0", null)).toEqual({ status: "no-requirement" });
    expect(compareNodeVersion("v20.11.0", "   ")).toEqual({ status: "no-requirement" });
  });

  it("reports uncertainty when the installed version is malformed", () => {
    expect(compareNodeVersion("not-a-version", ">=18").status).toBe("uncertain");
  });
});
