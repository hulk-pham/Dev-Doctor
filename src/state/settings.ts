export type ThemePreference = "dark" | "light" | "system";

export interface Settings {
  theme: ThemePreference;
  scanOnSelect: boolean;
  skippedUpdateVersion: string | null;
  updateRemindAt: string | null;
}

export const UPDATE_REMIND_MS = 24 * 60 * 60 * 1000;

export const SETTINGS_KEY = "dev-doctor.settings";

export const defaultSettings: Settings = {
  theme: "dark",
  scanOnSelect: true,
  skippedUpdateVersion: null,
  updateRemindAt: null,
};

export function readSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return defaultSettings;
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return {
      theme: parsed.theme === "light" || parsed.theme === "system" ? parsed.theme : "dark",
      scanOnSelect: parsed.scanOnSelect !== false,
      skippedUpdateVersion: typeof parsed.skippedUpdateVersion === "string" ? parsed.skippedUpdateVersion : null,
      updateRemindAt: typeof parsed.updateRemindAt === "string" ? parsed.updateRemindAt : null,
    };
  } catch {
    return defaultSettings;
  }
}

export function writeSettings(settings: Settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export function applyTheme(theme: ThemePreference) {
  const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const dark = theme === "dark" || (theme === "system" && systemDark);
  document.documentElement.classList.toggle("dark", dark);
}
