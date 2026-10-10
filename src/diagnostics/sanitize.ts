const ASSIGNMENT =
  /\b([A-Za-z_][A-Za-z0-9_]*)\s*=\s*([^\s"'`#]+)/g;

export function redactSecrets(text: string): string {
  return text.replace(ASSIGNMENT, (_match, key: string) => `${key}=[redacted]`);
}

export function redactList(lines: string[]): string[] {
  return lines.map((line) => redactSecrets(line));
}
