import { Button } from "@/components/ui/button";

interface StepNavigationProps {
  currentStep: number;
  totalSteps: number;
  stepLabels: string[];
  onStepChange?: (step: number) => void;
  canNavigate?: (step: number) => boolean;
}

export function StepNavigation({
  currentStep,
  totalSteps,
  stepLabels,
  onStepChange,
  canNavigate = () => true,
}: StepNavigationProps) {
  // Only show current step and available previous steps, not locked future steps
  const visibleSteps = Array.from({ length: currentStep }, (_, i) => i + 1);

  return (
    <div className="flex gap-3 flex-wrap justify-center mb-8 p-4">
      {visibleSteps.map((stepNum) => {
        const isActive = currentStep === stepNum;
        const isNavigable = canNavigate(stepNum);
        const index = stepNum - 1;

        return (
          <Button
            key={stepNum}
            onClick={() => isNavigable && onStepChange?.(stepNum)}
            disabled={!isNavigable}
            variant={isActive ? "cta" : "cta-inactive"}
            size="xl"
            className={`min-w-[160px] font-semibold ${!isNavigable ? "opacity-50 cursor-not-allowed" : ""}`}
          >
            {stepLabels[index] || `Step ${stepNum}`}
          </Button>
        );
      })}
    </div>
  );
}
