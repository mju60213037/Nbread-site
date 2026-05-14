"use client";

import { useEffect, useState } from "react";
import { Plus, X, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Person } from "@/lib/types";

interface PeopleInputProps {
  people: Person[];
  onChange: (people: Person[]) => void;
}

function createPerson(): Person {
  return {
    id: crypto.randomUUID(),
    name: "",
  };
}

export function PeopleInput({ people, onChange }: PeopleInputProps) {
  const [countInput, setCountInput] = useState(String(people.length));

  useEffect(() => {
    setCountInput(String(people.length));
  }, [people.length]);

  const addPerson = () => {
    onChange([...people, createPerson()]);
  };

  const changePeopleCount = (nextCount: number) => {
    const safeCount = Number.isFinite(nextCount)
      ? Math.min(50, Math.max(0, Math.floor(nextCount)))
      : 0;

    if (safeCount === people.length) return;

    if (safeCount > people.length) {
      const peopleToAdd = Array.from({ length: safeCount - people.length }, () =>
        createPerson()
      );
      onChange([...people, ...peopleToAdd]);
      return;
    }

    onChange(people.slice(0, safeCount));
  };

  const changeCountInput = (value: string) => {
    const onlyNumber = value.replace(/[^0-9]/g, "");
    const normalized = onlyNumber.replace(/^0+(?=\d)/, "");

    setCountInput(normalized);

    if (normalized === "") return;

    changePeopleCount(Number(normalized));
  };

  const removePerson = (id: string) => {
    onChange(people.filter((person) => person.id !== id));
  };

  const updatePerson = (id: string, updates: Partial<Person>) => {
    onChange(
      people.map((person) =>
        person.id === id ? { ...person, ...updates } : person
      )
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
          참여자 ({people.length}명)
        </h2>
        <Button variant="outline" size="sm" onClick={addPerson}>
          <Plus className="w-4 h-4 mr-1" />
          추가
        </Button>
      </div>

      <div className="p-3 bg-muted/40 border border-border rounded-xl space-y-2">
        <label className="text-sm font-medium">인원 수</label>
        <div className="flex items-center gap-2">
          <Input
            type="text"
            inputMode="numeric"
            value={countInput}
            onFocus={(event) => event.currentTarget.select()}
            onChange={(event) => changeCountInput(event.target.value)}
            onBlur={() => setCountInput(String(people.length))}
            placeholder="0"
            className="h-11 text-right"
          />
          <span className="text-sm text-muted-foreground shrink-0">명</span>
        </div>
        <p className="text-xs text-muted-foreground">
          인원 수를 입력하면 참여자 칸이 자동으로 맞춰집니다. 최대 50명까지 입력할 수 있어요.
        </p>
      </div>

      <div className="space-y-2">
        {people.map((person, index) => (
          <div
            key={person.id}
            className="p-3 bg-card border border-border rounded-xl"
          >
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary font-medium text-sm shrink-0">
                {index + 1}
              </div>

              <Input
                value={person.name}
                onChange={(event) =>
                  updatePerson(person.id, { name: event.target.value })
                }
                placeholder={`참여자 ${index + 1}`}
                className="flex-1"
              />

              <button
                onClick={() => removePerson(person.id)}
                className="p-2 hover:bg-muted rounded-lg transition-colors shrink-0"
                aria-label="참여자 삭제"
              >
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {people.length === 0 && (
        <div className="text-center py-8 text-muted-foreground border border-dashed border-border rounded-xl">
          <User className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm">인원 수를 입력하거나 참여자를 추가하세요</p>
        </div>
      )}
    </div>
  );
}
