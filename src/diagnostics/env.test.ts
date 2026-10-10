/// <reference types="node" />
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { compareEnvKeys, parseEnvKeys } from "./env";
import { buildScanResult, emptySnapshot } from "./engine";

const SECRET = "sample-secret-do-not-use";
const fixture = path.resolve("fixtures/sample-node-app/.env");

describe("environment keys", () => {
  it("compares names and ignores values", () => {
    const result = compareEnvKeys(["DATABASE_URL", "API_TOKEN", "APP_PORT"], ["DATABASE_URL", "APP_PORT"]);
    expect(result.missing).toEqual(["API_TOKEN"]);
    expect(result.present).toEqual(["DATABASE_URL", "APP_PORT"]);
    expect(JSON.stringify(result)).not.toContain("=");
  });

  it("cannot infer names without an example file", () => {
    expect(compareEnvKeys(null, ["DATABASE_URL"]).canInfer).toBe(false);
  });

  it("drops lines that smuggle a value into the key", () => {
    expect(parseEnvKeys(`API_TOKEN=${SECRET}\nNOT A KEY\n# comment\nexport APP_PORT=3000`).keys).toEqual([
      "API_TOKEN",
      "APP_PORT",
    ]);
  });

  it("reads the sample fixture without returning the secret", () => {
    const raw = readFileSync(fixture, "utf8");
    expect(raw).toContain(SECRET);
    const parsed = parseEnvKeys(raw);
    expect(parsed.keys).toContain("DATABASE_URL");
    expect(parsed.keys).not.toContain("API_TOKEN");
    expect(JSON.stringify(parsed)).not.toContain(SECRET);

    const example = parseEnvKeys(readFileSync(path.resolve("fixtures/sample-node-app/.env.example"), "utf8"));
    const scan = buildScanResult(
      emptySnapshot({
        isSample: true,
        env: {
          exampleFile: ".env.example",
          exampleKeys: example.keys,
          exampleReadError: null,
          exampleUnparsedLines: example.unparsedLines,
          envFileExists: true,
          envKeys: parsed.keys,
          envReadError: null,
          envUnparsedLines: parsed.unparsedLines,
          note: null,
        },
      }),
    );
    expect(JSON.stringify(scan.findings)).not.toContain(SECRET);
    expect(scan.findings.some((finding) => finding.evidence.some((line) => line.includes("API_TOKEN")))).toBe(true);
  });

  it("lists extra names without values", () => {
    expect(compareEnvKeys(["APP_PORT"], ["APP_PORT", "FEATURE_FLAG"]).extra).toEqual(["FEATURE_FLAG"]);
  });
});
