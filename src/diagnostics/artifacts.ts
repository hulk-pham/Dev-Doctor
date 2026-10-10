export type ArtifactCategory = "build-output" | "dependencies" | "test-report" | "cache" | "temporary" | "worktree" | "branch";

export type ArtifactSafety = "generated" | "reproducible" | "uncertain";

export type ArtifactKind = "directory" | "worktree" | "branch";

export interface RawArtifact {
  relativePath: string;
  name: string;
  kind: ArtifactKind;
  bytes: number | null;
  modifiedMs: number | null;
  truncated: boolean;
  missing: boolean;
  markers: string[];
  branch: string | null;
  lastCommitMs: number | null;
}

export interface ArtifactFinding {
  id: string;
  relativePath: string;
  category: ArtifactCategory;
  safety: ArtifactSafety;
  kind: ArtifactKind;
  bytes: number | null;
  modifiedMs: number | null;
  lastCommitMs: number | null;
  truncated: boolean;
  countsInTotal: boolean;
  technologies: string[];
  reason: string;
  consequence: string;
}

import catalogFile from "./artifact-catalog.json";

export interface CatalogConfirm {
  files?: string[];
  globs?: string[];
  dirs?: string[];
}

export interface CatalogRule {
  id: string;
  paths: string[];
  technologies: string[];
  category: ArtifactCategory;
  safety: ArtifactSafety;
  safetyUnconfirmed?: ArtifactSafety;
  omitIfUnconfirmed?: boolean;
  confirm?: CatalogConfirm;
  reason: string;
  reasonUnconfirmed?: string;
  consequence: string;
  consequenceUnconfirmed?: string;
}

export const artifactCatalog = catalogFile as { note: string; rules: CatalogRule[] };

export function classifyArtifact(raw: RawArtifact): ArtifactFinding | null {
  if (raw.kind === "worktree") {
    const branch = raw.branch ? ` Checked out branch ${raw.branch}.` : " No branch is checked out.";
    const missing = raw.missing ? " The folder is missing." : "";
    return finding(
      raw,
      "worktree",
      "uncertain",
      [],
      `Git worktree outside the selected folder.${branch}${missing} Age was not used.`,
      "This checkout may contain source files and uncommitted work. This view does not delete it.",
      false,
    );
  }
  if (raw.kind === "branch") {
    return finding(
      raw,
      "branch",
      "uncertain",
      [],
      "Local branch that is not checked out in any worktree. The last commit time is context only. Age was not used.",
      "Removing a branch is not offered here. A branch ref is not a generated folder.",
      false,
    );
  }
  const rule = matchRule(raw.name, raw.relativePath);
  if (!rule) return null;
  const confirmed = isConfirmed(rule, raw.markers);
  if (rule.omitIfUnconfirmed && !confirmed) return null;
  const safety = confirmed ? rule.safety : (rule.safetyUnconfirmed ?? "uncertain");
  return finding(
    raw,
    rule.category,
    safety,
    rule.technologies,
    confirmed ? rule.reason : (rule.reasonUnconfirmed ?? rule.reason),
    confirmed ? rule.consequence : (rule.consequenceUnconfirmed ?? rule.consequence),
    true,
  );
}

export function canDeleteArtifact(item: ArtifactFinding): boolean {
  return item.kind === "directory" && (item.safety === "generated" || item.safety === "reproducible");
}

export function classifyArtifacts(raws: RawArtifact[]): ArtifactFinding[] {
  return raws.flatMap((raw) => {
    const item = classifyArtifact(raw);
    return item ? [item] : [];
  });
}

function matchRule(name: string, relativePath: string): CatalogRule | null {
  const relative = relativePath.split("\\").join("/");
  let best: { rule: CatalogRule; length: number } | null = null;
  for (const rule of artifactCatalog.rules) {
    for (const pattern of rule.paths) {
      if (!patternMatches(pattern, name, relative)) continue;
      if (!best || pattern.length > best.length) best = { rule, length: pattern.length };
    }
  }
  return best?.rule ?? null;
}

function patternMatches(pattern: string, name: string, relativePath: string): boolean {
  if (pattern.startsWith("*")) return name.endsWith(pattern.slice(1));
  if (pattern.includes("/")) return relativePath === pattern || relativePath.endsWith(`/${pattern}`);
  return name === pattern;
}

function isConfirmed(rule: CatalogRule, markers: string[]): boolean {
  const confirm = rule.confirm;
  if (!confirm) return true;
  const tokens = [
    ...(confirm.files ?? []),
    ...(confirm.globs ?? []),
    ...(confirm.dirs ?? []).map((dir) => `${dir}/`),
  ];
  if (tokens.length === 0) return false;
  return tokens.some((token) => markers.includes(token));
}

function finding(
  raw: RawArtifact,
  category: ArtifactCategory,
  safety: ArtifactSafety,
  technologies: string[],
  reason: string,
  consequence: string,
  countsInTotal: boolean,
): ArtifactFinding {
  return {
    id: `${raw.kind}:${raw.relativePath}`,
    relativePath: raw.relativePath,
    category,
    safety,
    kind: raw.kind,
    bytes: raw.bytes,
    modifiedMs: raw.modifiedMs,
    lastCommitMs: raw.lastCommitMs,
    truncated: raw.truncated,
    countsInTotal,
    technologies,
    reason,
    consequence,
  };
}
