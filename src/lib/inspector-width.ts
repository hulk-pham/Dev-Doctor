export const INSPECTOR_WIDTH_DEFAULT = 320;
export const INSPECTOR_WIDTH_MIN = 320;
export const INSPECTOR_WIDTH_MAX = 480;

const STORAGE_KEY = "dev-doctor.inspector-width";

export function clampInspectorWidth(value: number): number {
  if (!Number.isFinite(value)) return INSPECTOR_WIDTH_DEFAULT;
  return Math.min(INSPECTOR_WIDTH_MAX, Math.max(INSPECTOR_WIDTH_MIN, Math.round(value)));
}

export function loadInspectorWidth(): number {
  if (typeof localStorage === "undefined") return INSPECTOR_WIDTH_DEFAULT;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw == null) return INSPECTOR_WIDTH_DEFAULT;
    return clampInspectorWidth(Number(raw));
  } catch {
    return INSPECTOR_WIDTH_DEFAULT;
  }
}

export function saveInspectorWidth(width: number): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, String(clampInspectorWidth(width)));
  } catch {
    // ignore quota / private mode
  }
}
