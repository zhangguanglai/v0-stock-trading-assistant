'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useStockStore } from '@/lib/store';

interface OnboardingStep {
  id: string;
  title: string;
  description: string;
  placement: 'top' | 'bottom' | 'left' | 'right';
  elementSelector?: string;
  actionText: string;
  onAction?: () => void;
}

interface OnboardingProps {
  steps: OnboardingStep[];
  onComplete: () => void;
}

export function Onboarding({ steps, onComplete }: OnboardingProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const { strategies, watchlist, positions } = useStockStore();
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // 检查是否需要显示引导
    const hasStrategies = strategies.length > 0;
    const hasWatchlist = watchlist.length > 0;
    const hasPositions = positions.length > 0;
    
    if (!hasStrategies || !hasWatchlist || !hasPositions) {
      setIsVisible(true);
    }
  }, [strategies, watchlist, positions]);

  if (!isVisible) return null;

  const current = steps[currentStep];

  const handleNext = () => {
    if (current.onAction) {
      current.onAction();
    }
    
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      onComplete();
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm">
              {currentStep + 1}
            </span>
            {current.title}
          </CardTitle>
          <CardDescription>{current.description}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">
              {currentStep + 1} / {steps.length}
            </span>
            <Button onClick={handleNext}>
              {currentStep < steps.length - 1 ? '下一步' : '完成'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>,
    document.body
  );
}

export function useOnboarding() {
  const [hasCompleted, setHasCompleted] = useState(false);
  
  useEffect(() => {
    const completed = localStorage.getItem('onboarding_completed');
    setHasCompleted(!!completed);
  }, []);
  
  const completeOnboarding = () => {
    localStorage.setItem('onboarding_completed', 'true');
    setHasCompleted(true);
  };
  
  return {
    hasCompleted,
    completeOnboarding,
  };
}
