"use client";

import { Calculator, FileText, Camera } from "lucide-react";
import type { InputMethod } from "@/lib/types";

interface InputMethodSelectorProps {
  selected: InputMethod;
  onSelect: (method: InputMethod) => void;
}

const methods = [
  {
    id: "simple" as InputMethod,
    title: "단순 입력",
    description: "총액과 인원수만 입력",
    icon: Calculator,
  },
  {
    id: "detailed" as InputMethod,
    title: "상세 입력",
    description: "항목별로 상세하게 입력",
    icon: FileText,
  },
  {
    id: "receipt" as InputMethod,
    title: "영수증 촬영",
    description: "영수증 사진으로 자동 입력",
    icon: Camera,
  },
];

export function InputMethodSelector({
  selected,
  onSelect,
}: InputMethodSelectorProps) {
  return (
    <div className="space-y-3">
      <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
        입력 방식
      </h2>
      <div className="grid grid-cols-3 gap-3">
        {methods.map((method) => {
          const Icon = method.icon;
          const isSelected = selected === method.id;
          return (
            <button
              key={method.id}
              onClick={() => onSelect(method.id)}
              className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${
                isSelected
                  ? "border-primary bg-primary/5"
                  : "border-border bg-card hover:border-primary/50"
              }`}
            >
              <div
                className={`p-3 rounded-full ${
                  isSelected
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                <Icon className="w-5 h-5" />
              </div>
              <div className="text-center">
                <p
                  className={`font-medium text-sm ${
                    isSelected ? "text-primary" : "text-foreground"
                  }`}
                >
                  {method.title}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5 hidden sm:block">
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
