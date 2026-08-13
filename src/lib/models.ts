export type Provider = "anthropic" | "deepseek";

export interface ModelInfo {
  /** Stable key stored in app data / settings — never changes even if the underlying API id does. */
  id: string;
  provider: Provider;
  /** The literal model string sent to the provider's API. */
  apiModelId: string;
  label: string;
  inputPricePerM: number;
  outputPricePerM: number;
}

export const MODELS: ModelInfo[] = [
  {
    id: "claude-haiku-4-5",
    provider: "anthropic",
    apiModelId: "claude-haiku-4-5-20251001",
    label: "Claude Haiku 4.5 — fast",
    inputPricePerM: 1.0,
    outputPricePerM: 5.0,
  },
  {
    id: "claude-sonnet-5",
    provider: "anthropic",
    apiModelId: "claude-sonnet-5",
    label: "Claude Sonnet 5 — stronger",
    inputPricePerM: 2.0,
    outputPricePerM: 10.0,
  },
  {
    id: "deepseek-v4-flash",
    provider: "deepseek",
    apiModelId: "deepseek-v4-flash",
    label: "DeepSeek V4 Flash — cheapest",
    inputPricePerM: 0.14,
    outputPricePerM: 0.28,
  },
];

export const DEFAULT_MODEL_ID = "claude-haiku-4-5";

export function getModel(id: string): ModelInfo {
  return MODELS.find((m) => m.id === id) || MODELS.find((m) => m.id === DEFAULT_MODEL_ID)!;
}

export function costUsd(model: ModelInfo, inputTokens: number, outputTokens: number): number {
  return (inputTokens / 1_000_000) * model.inputPricePerM + (outputTokens / 1_000_000) * model.outputPricePerM;
}

export function providerLabel(provider: Provider): string {
  return provider === "anthropic" ? "Anthropic" : "DeepSeek";
}
