const DENIED_PREFIXES = [
  "/System",
  "/usr",
  "/bin",
  "/sbin",
  "/Library",
  "/Applications",
  "/dev",
  "/etc",
  "/private/etc",
  "/private/var/root",
  "/var/root",
];

export type PathCheck = { ok: true; path: string } | { ok: false; reason: string };

export function validateProjectPath(input: string): PathCheck {
  if (typeof input !== "string" || input.trim() === "") {
    return { ok: false, reason: "Choose a project folder." };
  }
  if (input.includes("\0")) {
    return { ok: false, reason: "The path contains a null byte." };
  }
  if (!input.startsWith("/")) {
    return { ok: false, reason: "The project path must be absolute." };
  }
  if (/[;&|`$<>\n\r]/.test(input)) {
    return { ok: false, reason: "The path contains characters that are not allowed." };
  }
  const normalized = input.replace(/\/+/g, "/").replace(/\/$/, "") || "/";
  if (normalized === "/" || normalized === "/private") {
    return { ok: false, reason: "Scanning the filesystem root is not allowed." };
  }
  if (normalized.split("/").includes("..")) {
    return { ok: false, reason: "The path must not contain parent directory segments." };
  }
  for (const prefix of DENIED_PREFIXES) {
    if (normalized === prefix || normalized.startsWith(`${prefix}/`)) {
      return { ok: false, reason: "That system location cannot be scanned." };
    }
  }
  return { ok: true, path: normalized };
}

export function isUserWritablePath(path: string): boolean {
  return (
    path.startsWith("/Users/") ||
    path.startsWith("/Volumes/") ||
    path.startsWith("/tmp/") ||
    path.startsWith("/private/tmp/") ||
    path.startsWith("/var/folders/") ||
    path.startsWith("/private/var/folders/")
  );
}

export function validateFixRequest(action: string, projectPath: string): { ok: true } | { ok: false; reason: string } {
  if (action !== "npm-install" && action !== "pnpm-install") {
    return { ok: false, reason: "This action is not allowlisted." };
  }
  const path = validateProjectPath(projectPath);
  if (!path.ok) return path;
  if (!isUserWritablePath(path.path)) {
    return { ok: false, reason: "Install commands can only run inside a user or temporary folder." };
  }
  return { ok: true };
}
