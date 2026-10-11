import type { AiProviderId } from "./types";

export interface AiProviderOption {
  id: AiProviderId;
  label: string;
  defaultModel: string;
  host: string;
  keyOptional?: boolean;
  baseUrl?: string;
  baseUrlHint?: string;
}

const MOCK_PROVIDER: AiProviderOption = {
  id: "fake",
  label: "Mock AI (dev only)",
  defaultModel: "fake-model",
  host: "no network",
  keyOptional: true,
};

export const AI_PROVIDER_OPTIONS: AiProviderOption[] = [
  { id: "openai", label: "OpenAI", defaultModel: "gpt-4o-mini", host: "api.openai.com" },
  {
    id: "anthropic",
    label: "Anthropic",
    defaultModel: "claude-sonnet-4-20250514",
    host: "api.anthropic.com",
  },
  {
    id: "gemini",
    label: "Google Gemini",
    defaultModel: "gemini-2.0-flash",
    host: "generativelanguage.googleapis.com",
  },
  {
    id: "ollama",
    label: "Ollama (local)",
    defaultModel: "llama3.2",
    host: "127.0.0.1:11434",
    keyOptional: true,
    baseUrl: "http://127.0.0.1:11434/v1/chat/completions",
    baseUrlHint: "OpenAI-compatible chat URL",
  },
  { id: "groq", label: "Groq", defaultModel: "llama-3.3-70b-versatile", host: "api.groq.com" },
  {
    id: "together",
    label: "Together",
    defaultModel: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
    host: "api.together.xyz",
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    defaultModel: "openai/gpt-4o-mini",
    host: "openrouter.ai",
  },
  {
    id: "azure",
    label: "Azure OpenAI",
    defaultModel: "gpt-4o-mini",
    host: "*.openai.azure.com",
    baseUrlHint: "Resource endpoint, e.g. https://my-resource.openai.azure.com",
  },
];

export function providerOption(id: string): AiProviderOption | undefined {
  if (id === "fake") return MOCK_PROVIDER;
  return AI_PROVIDER_OPTIONS.find((entry) => entry.id === id);
}

/** Provider dropdown — mock entry only in Vite dev (matches Rust `debug_assertions`). */
export function aiProviderOptionsForUi(): AiProviderOption[] {
  if (!import.meta.env.DEV) return AI_PROVIDER_OPTIONS;
  return [...AI_PROVIDER_OPTIONS, MOCK_PROVIDER];
}

export function isMockAiProvider(id: string | undefined): boolean {
  return id === "fake";
}

export function providerHost(id: string): string {
  return providerOption(id)?.host ?? "api.openai.com";
}

export function isLocalOllamaEndpoint(url: string): boolean {
  const lower = url.trim().toLowerCase();
  return lower.startsWith("http://127.0.0.1") || lower.startsWith("http://localhost");
}

export function defaultModelForProvider(id: AiProviderId): string {
  return providerOption(id)?.defaultModel ?? "gpt-4o-mini";
}
