"use client";

import { useState } from "react";
import { Tag, Percent, Minus, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { DiscountOption } from "@/lib/types";

interface DiscountOptionsProps {
  discounts: DiscountOption[];
  onChange: (discounts: DiscountOption[]) => void;
}

export function DiscountOptions({ discounts, onChange }: DiscountOptionsProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [newDiscount, setNewDiscount] = useState<DiscountOption>({
    type: "fixed",
    value: 0,
    description: "",
  });

  const addDiscount = () => {
    if (newDiscount.value > 0) {
      onChange([...discounts, { ...newDiscount, description: newDiscount.description || getDefaultDescription(newDiscount) }]);
      setNewDiscount({ type: "fixed", value: 0, description: "" });
      setIsAdding(false);
    }
  };

  const removeDiscount = (index: number) => {
    onChange(discounts.filter((_, i) => i !== index));
  };

  const getDefaultDescription = (discount: DiscountOption) => {
    switch (discount.type) {
      case "coupon":
        return `쿠폰 ${discount.value.toLocaleString()}원`;
      case "percentage":
        return `${discount.value}% 할인`;
      case "fixed":
        return `${discount.value.toLocaleString()}원 할인`;
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
          할인/쿠폰
        </h2>
        {!isAdding && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsAdding(true)}
            className="text-primary hover:text-primary/80 h-7 px-2"
          >
            <Plus className="w-4 h-4 mr-1" />
            추가
          </Button>
        )}
      </div>

      {discounts.length > 0 && (
        <div className="space-y-2">
          {discounts.map((discount, index) => (
            <div
              key={index}
              className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
            >
              <div className="flex items-center gap-2">
                {discount.type === "percentage" ? (
                  <Percent className="w-4 h-4 text-primary" />
                ) : (
                  <Tag className="w-4 h-4 text-primary" />
                )}
                <span className="text-sm font-medium">
                  {discount.description || getDefaultDescription(discount)}
                </span>
              </div>
              <button
                onClick={() => removeDiscount(index)}
                className="p-1 hover:bg-muted rounded"
              >
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>
          ))}
        </div>
      )}

      {isAdding && (
        <div className="p-4 bg-card border border-border rounded-xl space-y-4">
          <div className="grid grid-cols-3 gap-2">
            {[
              { type: "fixed", label: "금액 할인", icon: Minus },
              { type: "percentage", label: "% 할인", icon: Percent },
              { type: "coupon", label: "쿠폰", icon: Tag },
            ].map((option) => {
              const Icon = option.icon;
              return (
                <button
                  key={option.type}
                  onClick={() =>
                    setNewDiscount({ ...newDiscount, type: option.type as DiscountOption["type"] })
                  }
                  className={`flex flex-col items-center gap-1 p-3 rounded-lg border transition-all ${
                    newDiscount.type === option.type
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/50"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span className="text-xs">{option.label}</span>
                </button>
              );
            })}
          </div>

          <div className="flex gap-2">
            <Input
              type="number"
              placeholder={newDiscount.type === "percentage" ? "할인율 (%)" : "금액 (원)"}
              value={newDiscount.value || ""}
              onChange={(e) =>
                setNewDiscount({ ...newDiscount, value: Number(e.target.value) })
              }
              className="flex-1"
            />
          </div>

          <Input
            type="text"
            placeholder="설명 (선택)"
            value={newDiscount.description || ""}
            onChange={(e) =>
              setNewDiscount({ ...newDiscount, description: e.target.value })
            }
          />

          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setIsAdding(false)}
            >
              취소
            </Button>
            <Button className="flex-1" onClick={addDiscount}>
              추가하기
            </Button>
          </div>
        </div>
      )}

      {discounts.length === 0 && !isAdding && (
        <p className="text-sm text-muted-foreground text-center py-3">
          할인이나 쿠폰이 있으면 추가하세요
        </p>
      )}
    </div>
  );
}
