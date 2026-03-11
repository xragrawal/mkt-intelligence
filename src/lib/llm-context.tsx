import { createContext, useContext, useState, type ReactNode } from "react";

export type LLMProvider = "gemini_direct" | "lovable" | "claude" | "openai";

export const LLM_OPTIONS: { id: LLMProvider; label: string; description: string }[] = [
  { id: "openai", label: "GPT-4o", description: "OpenAI — highest quality & speed" },
  { id: "gemini_direct", label: "Gemini 2.5 Flash", description: "Google AI — fast & cost-effective" },
  { id: "lovable", label: "Lovable AI", description: "Gateway — Gemini 3 Flash Preview" },
  { id: "claude", label: "Claude Sonnet 4", description: "Anthropic — highest quality" },
];

interface LLMContextValue {
  provider: LLMProvider;
  setProvider: (p: LLMProvider) => void;
}

const LLMContext = createContext<LLMContextValue>({
  provider: "openai",
  setProvider: () => {},
});

export function LLMProviderProvider({ children }: { children: ReactNode }) {
  const [provider, setProvider] = useState<LLMProvider>("openai");
  return (
    <LLMContext.Provider value={{ provider, setProvider }}>
      {children}
    </LLMContext.Provider>
  );
}

export function useLLMProvider() {
  return useContext(LLMContext);
}
