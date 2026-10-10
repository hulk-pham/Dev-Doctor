import semver from "semver";

export type VersionComparison =
  | { status: "no-requirement" }
  | { status: "satisfied"; installed: string; range: string }
  | { status: "unsatisfied"; installed: string; range: string }
  | { status: "uncertain"; reason: string };

export function compareNodeVersion(
  installedRaw: string | null | undefined,
  rangeRaw: string | null | undefined,
): VersionComparison {
  const range = rangeRaw?.trim() ?? "";
  if (!range) return { status: "no-requirement" };

  const validRange = semver.validRange(range);
  if (!validRange) {
    return {
      status: "uncertain",
      reason: `The engines.node value "${range}" is not a range Dev Doctor can evaluate reliably.`,
    };
  }

  const installedText = installedRaw?.trim() ?? "";
  if (!installedText) {
    return {
      status: "uncertain",
      reason: "Node.js is not available, so the engines.node range was not compared.",
    };
  }

  const cleaned = semver.clean(installedText) ?? semver.valid(semver.coerce(installedText));
  if (!cleaned) {
    return {
      status: "uncertain",
      reason: `The installed Node.js version "${installedText}" could not be parsed.`,
    };
  }

  if (semver.satisfies(cleaned, validRange, { includePrerelease: true })) {
    return { status: "satisfied", installed: cleaned, range };
  }
  return { status: "unsatisfied", installed: cleaned, range };
}
