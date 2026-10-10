const KEY = /^[A-Za-z_][A-Za-z0-9_]*$/;

export interface ParsedEnvKeys {
  keys: string[];
  unparsedLines: number;
}

export interface EnvKeyComparison {
  canInfer: boolean;
  missing: string[];
  present: string[];
  extra: string[];
}

/**
 * Extract environment variable names. Values are discarded and never returned.
 * Mirrors the Rust parser in src-tauri/src/snapshot.rs.
 */
export function parseEnvKeys(contents: string): ParsedEnvKeys {
  if (contents.includes("\0")) {
    return { keys: [], unparsedLines: 0 };
  }
  const keys: string[] = [];
  let unparsedLines = 0;
  for (const raw of contents.split(/\r?\n/)) {
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const line = trimmed.startsWith("export ") ? trimmed.slice("export ".length).trim() : trimmed;
    const equals = line.indexOf("=");
    if (equals <= 0) {
      unparsedLines += 1;
      continue;
    }
    const key = line.slice(0, equals).trim();
    if (!KEY.test(key)) {
      unparsedLines += 1;
      continue;
    }
    if (!keys.includes(key)) keys.push(key);
  }
  return { keys, unparsedLines };
}

export function normalizeEnvKeys(keys: readonly string[]): string[] {
  const out: string[] = [];
  for (const key of keys) {
    if (!KEY.test(key)) continue;
    if (!out.includes(key)) out.push(key);
  }
  return out;
}

export function compareEnvKeys(
  exampleKeys: readonly string[] | null,
  envKeys: readonly string[] | null,
): EnvKeyComparison {
  if (!exampleKeys) {
    return { canInfer: false, missing: [], present: [], extra: [] };
  }
  const example = normalizeEnvKeys(exampleKeys);
  if (!envKeys) {
    return { canInfer: true, missing: example, present: [], extra: [] };
  }
  const env = normalizeEnvKeys(envKeys);
  const envSet = new Set(env);
  const exampleSet = new Set(example);
  return {
    canInfer: true,
    missing: example.filter((key) => !envSet.has(key)),
    present: example.filter((key) => envSet.has(key)),
    extra: env.filter((key) => !exampleSet.has(key)),
  };
}
