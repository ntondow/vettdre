"use client";

import React from "react";

interface Props {
  currentStep: number;
  totalSteps: number;
  stepLabel: string;
  children: React.ReactNode;
  propertyAddress: string;
  orgName: string;
}

export default function WizardShell({
  currentStep,
  totalSteps,
  stepLabel,
  children,
  propertyAddress,
  orgName,
}: Props) {
  const progressPercent = totalSteps > 0 ? (currentStep / totalSteps) * 100 : 0;

  return (
    <div className="min-h-dvh bg-white flex flex-col">
      {/* Header */}
      <header className="border-b border-slate-100 bg-white flex-shrink-0 sticky top-0 z-40">
        <div className="mx-auto px-4 py-3 sm:py-4 max-w-lg">
          <div className="flex items-baseline gap-1 mb-3">
            <span className="text-base sm:text-lg font-bold text-slate-900">Vettd</span>
            <span className="text-base sm:text-lg font-bold text-blue-600">RE</span>
          </div>
          <div className="text-xs sm:text-sm text-slate-600 line-clamp-1">{propertyAddress}</div>
          {orgName && <div className="text-xs text-slate-400">{orgName}</div>}
        </div>
      </header>

      {/* Progress Bar */}
      <div className="border-b border-slate-100 bg-slate-50 px-4 py-3 sm:py-4">
        <div className="mx-auto max-w-lg">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs sm:text-sm font-medium text-slate-700">
              Step {currentStep} of {totalSteps}
            </span>
            <span className="text-xs sm:text-sm font-medium text-slate-600">{stepLabel}</span>
          </div>
          <div className="h-1.5 sm:h-2 rounded-full bg-slate-200 overflow-hidden">
            <div
              className="h-full rounded-full bg-blue-600 transition-all duration-500 ease-out"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="mx-auto px-4 w-full flex-1 max-w-lg animate-[fade-in_0.2s_ease-out]">
        <div className="py-6 sm:py-8">{children}</div>
      </main>

      {/* Footer Safe Area */}
      <div className="pb-safe" />
    </div>
  );
}
