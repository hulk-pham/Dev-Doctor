export type ThemePreference = "dark" | "light" | "system";

export interface Settings {
  theme: ThemePreference;
  scanOnSelect: boolean;
}

export const SETTINGS_KEY = "dev-doctor.settings";

export const defaultSettings: Settings = {
  theme: "dark",
  scanOnSelect: true,
};

export function readSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return defaultSettings;
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return {
      theme: parsed.theme === "light" || parsed.theme === "system" ? parsed.theme : "dark",
      scanOnSelect: parsed.scanOnSelect !== false,
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
