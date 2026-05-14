"use client";

import { Divide, CreditCard, List, Percent } from "lucide-react";
import type { CalculationMethod } from "@/lib/types";

interface CalculationMethodSelectorProps {
  selected: CalculationMethod;
  onSelect: (method: CalculationMethod) => void;
}

const methods = [
  {
    id: "equal-split" as CalculationMethod,
    title: "N분의 1",
    description: "총액을 인원수로 나눔",
    icon: Divide,
  },
  {
    id: "prepaid" as CalculationMethod,
    title: "먼저 낸 사람",
    description: "선결제 금액 반영",
    icon: CreditCard,
  },
  {
    id: "item-based" as CalculationMethod,
    title: "항목별 정산",
    description: "먹은 만큼 계산",
    icon: List,
  },
  {
    id: "ratio" as CalculationMethod,
    title: "비율 정산",
    description: "비율대로 나눔",
    icon: Percent,
  },
];

export function CalculationMethodSelector({
  selected,
  onSelect,
}: CalculationMethodSelectorProps) {
  return (
    <div className="space-y-3">
      <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
        계산 방식
      </h2>
      <div className="grid grid-cols-2 gap-3">
        {methods.map((method) => {
          const Icon = method.icon;
          const isSelected = selected === method.id;
          return (
            <button
              key={method.id}
              onClick={() => onSelect(method.id)}
              className={`flex items-center gap-3 p-4 rounded-xl border-2 transition-all text-left ${
                isSelected
                  ? "border-primary bg-primary/5"
                  : "border-border bg-card hover:border-primary/50"
              }`}
            >
              <div
                className={`p-2.5 rounded-lg shrink-0 ${
                  isSelected
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                <Icon className="w-4 h-4" />
              </div>
              <div>
                <p
                  className={`font-medium text-sm ${
                    isSelected ? "text-primary" : "text-foreground"
                  }`}
                >
                  {method.title}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {method.description}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
