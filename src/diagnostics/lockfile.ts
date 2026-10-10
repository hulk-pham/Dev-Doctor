export type PackageManagerId = "npm" | "pnpm" | "yarn" | "bun";

const LOCKFILE_MAP: Record<string, PackageManagerId> = {
  "package-lock.json": "npm",
  "npm-shrinkwrap.json": "npm",
  "pnpm-lock.yaml": "pnpm",
  "yarn.lock": "yarn",
  "bun.lock": "bun",
  "bun.lockb": "bun",
};

export interface LockfileDetection {
  lockfiles: string[];
  managers: PackageManagerId[];
  primary: PackageManagerId | null;
  inconsistent: boolean;
}

export function detectLockfiles(lockfiles: readonly string[]): LockfileDetection {
  const known = lockfiles.filter((file) => Object.prototype.hasOwnProperty.call(LOCKFILE_MAP, file));
  const managers = [...new Set(known.map((file) => LOCKFILE_MAP[file]))];
  return {
    lockfiles: known,
    managers,
    primary: managers.length === 1 ? managers[0] : null,
    inconsistent: managers.length > 1,
  };
}

export function packageManagerLabel(detection: LockfileDetection): string {
  if (detection.inconsistent) return detection.managers.join(" + ");
  if (detection.primary) return detection.primary;
  if (detection.lockfiles.length === 0) return "Not detected";
  return detection.lockfiles.join(", ");
}
