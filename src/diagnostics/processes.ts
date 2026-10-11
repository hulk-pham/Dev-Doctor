export interface ProjectRef {
  path: string;
  name: string;
}

export function formatTcpPorts(ports: number[], limit = 4): string {
  if (ports.length === 0) return "";
  const shown = ports.slice(0, limit).map((port) => `:${port}`);
  if (ports.length > limit) shown.push("…");
  return shown.join(", ");
}

export function processHasPort(process: { tcpPorts: number[] }, port: number): boolean {
  return process.tcpPorts.includes(port);
}

export function processMatchesQuery(
  process: { name: string; command: string; tcpPorts: number[] },
  query: string,
): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  if (process.name.toLowerCase().includes(needle) || process.command.toLowerCase().includes(needle)) return true;
  const digits = needle.replace(/^:/, "");
  if (!/^\d+$/.test(digits)) return false;
  return process.tcpPorts.some((port) => String(port).includes(digits));
}

/** Default Processes view: development tools only (see Rust `DEV_NAMES`). */
export function filterProcessesForView<T extends { development: boolean }>(rows: T[], showAllProcesses: boolean): T[] {
  if (showAllProcesses) return rows;
  return rows.filter((row) => row.development);
}

export function projectForProcess(
  process: { name: string; command: string; cwd: string | null },
  projects: ProjectRef[],
): ProjectRef | null {
  const haystack = [process.cwd ?? "", process.command];
  const ordered = [...projects].sort((left, right) => right.path.length - left.path.length);
  return (
    ordered.find((project) => project.path.length > 1 && haystack.some((value) => value.includes(project.path))) ?? null
  );
}
