"use client";

import { useState } from "react";
import { Plus, X, ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Item, Person } from "@/lib/types";

interface ItemsInputProps {
  items: Item[];
  onChange: (items: Item[]) => void;
  people: Person[];
}

export function ItemsInput({ items, onChange, people }: ItemsInputProps) {
  const [newItem, setNewItem] = useState({ name: "", price: 0, quantity: 1 });

  const addItem = () => {
    if (newItem.name.trim() && newItem.price > 0) {
      const item: Item = {
        id: Date.now().toString(),
        name: newItem.name.trim(),
        price: newItem.price,
        quantity: newItem.quantity,
        assignedTo: [],
      };
      onChange([...items, item]);
      setNewItem({ name: "", price: 0, quantity: 1 });
    }
  };

  const removeItem = (id: string) => {
    onChange(items.filter((item) => item.id !== id));
  };

  const togglePersonAssignment = (itemId: string, personId: string) => {
    onChange(
      items.map((item) => {
        if (item.id === itemId) {
          const isAssigned = item.assignedTo.includes(personId);
          return {
            ...item,
            assignedTo: isAssigned
              ? item.assignedTo.filter((id) => id !== personId)
              : [...item.assignedTo, personId],
          };
        }
        return item;
      })
    );
  };

  const assignAllPeople = (itemId: string) => {
    onChange(
      items.map((item) => {
        if (item.id === itemId) {
          return {
            ...item,
            assignedTo: people.map((p) => p.id),
          };
        }
        return item;
      })
    );
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addItem();
    }
  };

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
        항목 ({items.length}개)
      </h2>

      <div className="space-y-3">
        {items.map((item) => (
          <div
            key={item.id}
            className="p-4 bg-card border border-border rounded-xl space-y-3"
          >
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <p className="font-medium">{item.name}</p>
                <p className="text-sm text-muted-foreground">
                  {item.price.toLocaleString()}원 x {item.quantity}개 ={" "}
                  <span className="text-foreground font-medium">
                    {(item.price * item.quantity).toLocaleString()}원
                  </span>
                </p>
              </div>
              <button
                onClick={() => removeItem(item.id)}
                className="p-1.5 hover:bg-muted rounded-lg"
              >
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>

            {people.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">누가 먹었나요?</p>
                  <button
                    onClick={() => assignAllPeople(item.id)}
                    className="text-xs text-primary hover:underline"
                  >
                    전체 선택
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {people.map((person) => {
                    const isAssigned = item.assignedTo.includes(person.id);
                    return (
                      <button
                        key={person.id}
                        onClick={() => togglePersonAssignment(item.id, person.id)}
                        className={`px-3 py-1.5 rounded-full text-sm transition-all ${
                          isAssigned
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-muted-foreground hover:bg-muted/80"
                        }`}
                      >
                        {person.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        ))}

        <div className="p-4 bg-muted/30 border border-dashed border-border rounded-xl space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <Input
              value={newItem.name}
              onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
              placeholder="항목명"
              className="col-span-2"
              onKeyDown={handleKeyDown}
            />
            <Input
              type="number"
              value={newItem.price || ""}
              onChange={(e) => setNewItem({ ...newItem, price: Number(e.target.value) })}
              placeholder="가격"
              onKeyDown={handleKeyDown}
            />
            <Input
              type="number"
              value={newItem.quantity}
              onChange={(e) => setNewItem({ ...newItem, quantity: Number(e.target.value) || 1 })}
              placeholder="수량"
              min={1}
              onKeyDown={handleKeyDown}
            />
          </div>
          <Button onClick={addItem} className="w-full" variant="outline">
            <Plus className="w-4 h-4 mr-2" />
            항목 추가
          </Button>
        </div>
      </div>

      {items.length === 0 && (
        <div className="text-center py-6 text-muted-foreground">
          <ShoppingBag className="w-10 h-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm">주문 항목을 추가하세요</p>
        </div>
      )}
    </div>
  );
}
