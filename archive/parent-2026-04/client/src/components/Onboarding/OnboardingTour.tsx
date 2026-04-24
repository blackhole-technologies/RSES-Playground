/**
 * @file OnboardingTour.tsx
 * @description Interactive onboarding tour with step-by-step guidance
 * @phase Phase 5 - Prompting & Learning
 */

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Sparkles, ArrowRight, X, FileCode, Play, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { onboardingSteps } from "@shared/prompts";

interface OnboardingTourProps {
  forceShow?: boolean;
  onComplete?: () => void;
}

export function OnboardingTour({ forceShow = false, onComplete }: OnboardingTourProps) {
  const [hasSeenOnboarding, setHasSeenOnboarding] = useLocalStorage(
    "rses-onboarding-completed",
    false
  );
  const [currentStep, setCurrentStep] = useState(0);
  const [isOpen, setIsOpen] = useState(false);

  // Show onboarding on first visit or when forced
  useEffect(() => {
    if (forceShow || !hasSeenOnboarding) {
      setIsOpen(true);
    }
  }, [forceShow, hasSeenOnboarding]);

  const step = onboardingSteps[currentStep];
  const progress = ((currentStep + 1) / onboardingSteps.length) * 100;
  const isLastStep = currentStep === onboardingSteps.length - 1;

  const handleNext = () => {
    if (isLastStep) {
      handleComplete();
    } else {
      setCurrentStep((prev) => prev + 1);
    }
  };

  const handleSkip = () => {
    handleComplete();
  };

  const handleComplete = () => {
    setHasSeenOnboarding(true);
    setIsOpen(false);
    setCurrentStep(0);
    onComplete?.();
  };

  const getStepIcon = (stepId: string) => {
    switch (stepId) {
      case "welcome":
        return <Sparkles className="h-8 w-8 text-primary" />;
      case "editor":
        return <FileCode className="h-8 w-8 text-blue-500" />;
      case "test":
        return <Play className="h-8 w-8 text-emerald-500" />;
      case "finish":
        return <CheckCircle2 className="h-8 w-8 text-primary" />;
      default:
        return <Sparkles className="h-8 w-8 text-primary" />;
    }
  };

  if (!step) return null;

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {getStepIcon(step.id)}
              <div>
                <DialogTitle>{step.title}</DialogTitle>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs text-muted-foreground">
                    Step {currentStep + 1} of {onboardingSteps.length}
                  </span>
                </div>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={handleSkip}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </DialogHeader>

        <div className="py-6">
          <Progress value={progress} className="h-1 mb-6" />

          <DialogDescription className="text-base">
            {step.description}
          </DialogDescription>

          {/* Step indicators */}
          <div className="flex justify-center gap-2 mt-6">
            {onboardingSteps.map((_, i) => (
              <div
                key={i}
                className={cn(
                  "w-2 h-2 rounded-full transition-colors",
                  i === currentStep
                    ? "bg-primary"
                    : i < currentStep
                    ? "bg-primary/50"
                    : "bg-muted"
                )}
              />
            ))}
          </div>
        </div>

        <DialogFooter className="flex-row justify-between sm:justify-between">
          {!isLastStep && (
            <Button variant="ghost" onClick={handleSkip}>
              Skip tour
            </Button>
          )}
          <Button onClick={handleNext} className="gap-2">
            {step.action}
            {!isLastStep && <ArrowRight className="h-4 w-4" />}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Hook to control onboarding state
 */
export function useOnboarding() {
  const [hasSeenOnboarding, setHasSeenOnboarding] = useLocalStorage(
    "rses-onboarding-completed",
    false
  );

  return {
    hasCompleted: hasSeenOnboarding,
    reset: () => setHasSeenOnboarding(false),
    markComplete: () => setHasSeenOnboarding(true),
  };
}
