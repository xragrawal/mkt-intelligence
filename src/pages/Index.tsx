import { useState } from "react";
import { Header } from "@/components/signal/Header";
import { Step1Panel } from "@/components/signal/Step1Panel";
import { Step2Panel } from "@/components/signal/Step2Panel";
import { Step3Panel } from "@/components/signal/Step3Panel";
import { LLMProviderProvider } from "@/lib/llm-context";
import type { CollectionRunSummary, ScoredArticle } from "@/lib/types";

const Index = () => {
  const [collectionRun, setCollectionRun] = useState<CollectionRunSummary | null>(null);
  const [scoredArticles, setScoredArticles] = useState<ScoredArticle[]>([]);
  const [selectedArticles, setSelectedArticles] = useState<ScoredArticle[]>([]);
  const [step2Done, setStep2Done] = useState(false);
  const [selectedRegions, setSelectedRegions] = useState<string[]>(["Global"]);


  return (
    <LLMProviderProvider>
      <div className="min-h-screen bg-background">
        <Header />
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
          <div id="step-1">
            <Step1Panel
              onRunComplete={setCollectionRun}
              lastRun={collectionRun}
              selectedRegions={selectedRegions}
              onRegionsChange={setSelectedRegions}
            />
          </div>
          <div id="step-2">
            <Step2Panel
              collectionRun={collectionRun}
              scoredArticles={scoredArticles}
              onArticlesScored={(articles) => {
                setScoredArticles(articles);
                setStep2Done(true);
              }}
              selectedArticles={selectedArticles}
              onSelectionChange={setSelectedArticles}
              selectedRegions={selectedRegions}
            />
          </div>
          <div id="step-3">
            <Step3Panel
              selectedArticles={selectedArticles}
              enabled={step2Done && selectedArticles.length > 0}
              collectionRun={collectionRun}
            />
          </div>
        </main>
      </div>
    </LLMProviderProvider>
  );
};

export default Index;
