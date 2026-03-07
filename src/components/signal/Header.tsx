import { Radio, Brain } from "lucide-react";
import { useLLMProvider, LLM_OPTIONS, type LLMProvider } from "@/lib/llm-context";

export function Header() {
  const { provider, setProvider } = useLLMProvider();

  return (
    <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
            <Radio className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-display font-bold tracking-tight text-foreground">
              Signal
            </h1>
            <p className="text-xs text-muted-foreground font-body">
              Market Intelligence & Lead Discovery
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <Brain className="w-3.5 h-3.5 text-muted-foreground" />
            <select
              value={provider}
              onChange={(e) => setProvider(e.target.value as LLMProvider)}
              className="bg-muted border border-border rounded-md px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            >
              {LLM_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <span className="text-xs text-muted-foreground font-body">
            v1.0
          </span>
        </div>
      </div>
    </header>
  );
}
