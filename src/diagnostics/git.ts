export interface GitStatusEntry {
  code: string;
  path: string;
}

export interface ParsedGitStatus {
  dirty: boolean;
  entries: GitStatusEntry[];
}

export function parseGitPorcelain(porcelain: string): ParsedGitStatus {
  const lines = porcelain.split(/\r?\n/).filter((line) => line.length > 0);
  const entries = lines.map((line) => ({
    code: line.slice(0, 2),
    path: line.length > 3 ? line.slice(3) : "",
  }));
  return { dirty: entries.length > 0, entries };
}
