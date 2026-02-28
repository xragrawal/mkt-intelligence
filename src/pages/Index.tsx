import { useState } from "react";
import { Header } from "@/components/signal/Header";
import { Step1Panel } from "@/components/signal/Step1Panel";
import { Step2Panel } from "@/components/signal/Step2Panel";
import { Step3Panel } from "@/components/signal/Step3Panel";
import type { CollectionRunSummary, ScoredArticle } from "@/lib/types";

const Index = () => {
  const [collectionRun, setCollectionRun] = useState<CollectionRunSummary | null>(null);
  const [scoredArticles, setScoredArticles] = useState<ScoredArticle[]>([]);
  const [selectedArticles, setSelectedArticles] = useState<ScoredArticle[]>([]);
  const [step2Done, setStep2Done] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        <Step1Panel onRunComplete={setCollectionRun} lastRun={collectionRun} />
        <Step2Panel
          collectionRun={collectionRun}
          scoredArticles={scoredArticles}
          onArticlesScored={(articles) => {
            setScoredArticles(articles);
            setStep2Done(true);
          }}
          selectedArticles={selectedArticles}
          onSelectionChange={setSelectedArticles}
        />
        <Step3Panel
          selectedArticles={selectedArticles}
          enabled={step2Done && selectedArticles.length > 0}
          collectionRun={collectionRun}
        />
      </main>
    </div>
  );
};

export default Index;
