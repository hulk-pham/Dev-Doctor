import { describe, expect, it } from "vitest";
import { buildScanResult, collectRuleFindings, emptySnapshot, summarizeFindings } from "./engine";

const SECRET = "super-secret-db-password";

describe("diagnostic engine", () => {
  it("reports a malformed package.json without failing the whole scan", () => {
    const scan = buildScanResult(
      emptySnapshot({
        packageJson: {
          present: true,
          parseError: "package.json is not valid JSON",
          readError: null,
          name: null,
          enginesNode: null,
          enginesNodeError: null,
          dependencyNames: [],
          devDependencyNames: [],
        },
      }),
    );
    expect(scan.findings.some((finding) => finding.id === "package-json-malformed")).toBe(true);
    expect(scan.findings.some((finding) => finding.id === "node-installed")).toBe(true);
  });

  it("reports a missing package.json and permission errors", () => {
    const missing = buildScanResult(
      emptySnapshot({
        packageJson: {
          present: false,
          parseError: null,
          readError: null,
          name: null,
          enginesNode: null,
          enginesNodeError: null,
          dependencyNames: [],
          devDependencyNames: [],
        },
      }),
    );
    expect(missing.findings.some((finding) => finding.id === "package-json-missing")).toBe(true);

    const denied = buildScanResult(
      emptySnapshot({
        packageJson: {
          present: true,
          parseError: null,
          readError: "Permission denied while reading package.json.",
          name: null,
          enginesNode: null,
          enginesNodeError: null,
          dependencyNames: [],
          devDependencyNames: [],
        },
      }),
    );
    expect(denied.findings.some((finding) => finding.evidence.join(" ").includes("Permission denied"))).toBe(true);
  });

  it("reports a Node.js mismatch and missing install as separate findings", () => {
    const scan = buildScanResult(
      emptySnapshot({
        node: { available: true, version: "v26.9.0", error: null },
        packageJson: {
          present: true,
          parseError: null,
          readError: null,
          name: "sample-broken-app",
          enginesNode: ">=18 <20",
          enginesNodeError: null,
          dependencyNames: ["left-pad"],
          devDependencyNames: [],
        },
        lockfiles: ["package-lock.json"],
        nodeModulesExists: false,
      }),
    );
    expect(scan.findings.some((finding) => finding.id === "engines-mismatch")).toBe(true);
    const install = scan.findings.find((finding) => finding.id === "node-modules-missing");
    expect(install?.fix?.kind).toBe("execute");
    expect(install?.fix?.action).toBe("npm-install");
    expect(scan.health).toBe("unhealthy");
  });

  it("does not offer an install when lockfiles disagree", () => {
    const scan = buildScanResult(
      emptySnapshot({
        packageJson: {
          present: true,
          parseError: null,
          readError: null,
          name: "sample",
          enginesNode: null,
          enginesNodeError: null,
          dependencyNames: ["left-pad"],
          devDependencyNames: ["typescript"],
        },
        lockfiles: ["package-lock.json", "pnpm-lock.yaml"],
        nodeModulesExists: false,
      }),
    );
    const install = scan.findings.find((finding) => finding.id === "node-modules-missing");
    expect(install?.fix?.kind).toBe("copy");
    expect(scan.findings.some((finding) => finding.id === "lockfiles-inconsistent")).toBe(true);
  });

  it("never places a secret value in findings", () => {
    const scan = buildScanResult(
      emptySnapshot({
        env: {
          exampleFile: ".env.example",
          exampleKeys: ["DATABASE_URL", "API_TOKEN"],
          exampleReadError: null,
          exampleUnparsedLines: 0,
          envFileExists: true,
          envKeys: ["DATABASE_URL"],
          envReadError: null,
          envUnparsedLines: 0,
          note: null,
        },
      }),
    );
    const blob = JSON.stringify(scan);
    expect(blob).not.toContain(SECRET);
    expect(blob).toContain("Missing key: API_TOKEN");
    expect(blob).not.toContain("DATABASE_URL=");
  });

  it("redacts an accidental assignment before it can be displayed", () => {
    const [finding] = collectRuleFindings([
      () => {
        throw new Error(`token=${SECRET}`);
      },
    ]);
    expect(finding.evidence.join(" ")).not.toContain(SECRET);
    expect(finding.evidence.join(" ")).toContain("[redacted]");
  });

  it("keeps going when one rule throws", () => {
    const findings = collectRuleFindings([
      () => {
        throw new Error("boom");
      },
      () => [
        {
          id: "still-here",
          category: "git",
          severity: "info",
          status: "pass",
          title: "Still here",
          explanation: "ok",
          evidence: [],
          recommendedAction: "none",
        },
      ],
    ]);
    expect(summarizeFindings(findings).passed).toBe(1);
    expect(findings).toHaveLength(2);
  });

  it("skips npm checks when the folder is not a source project", () => {
    const scan = buildScanResult(
      emptySnapshot({
        ecosystem: null,
        packageJson: {
          present: false,
          parseError: null,
          readError: null,
          name: null,
          enginesNode: null,
          enginesNodeError: null,
          dependencyNames: [],
          devDependencyNames: [],
        },
        lockfiles: [],
      }),
    );
    expect(scan.project.projectType).toBe("Not a source project");
    expect(scan.findings.some((finding) => finding.id === "not-a-source-project")).toBe(true);
    expect(scan.findings.some((finding) => finding.id === "package-json-missing" || finding.id === "npm-missing" || finding.id === "node-missing")).toBe(false);
  });

  it("skips npm checks for a non-node manifest", () => {
    const scan = buildScanResult(
      emptySnapshot({
        ecosystem: "rust",
        packageJson: {
          present: false,
          parseError: null,
          readError: null,
          name: null,
          enginesNode: null,
          enginesNodeError: null,
          dependencyNames: [],
          devDependencyNames: [],
        },
        lockfiles: [],
      }),
    );
    expect(scan.project.projectType).toBe("Rust");
    expect(scan.findings.some((finding) => finding.id === "ecosystem-not-node")).toBe(true);
    expect(scan.findings.some((finding) => finding.id === "npm-missing" || finding.id === "package-json-missing")).toBe(false);
  });
});
