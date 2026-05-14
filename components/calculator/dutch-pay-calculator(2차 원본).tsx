"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  FileText,
  Gift,
  Plus,
  ReceiptText,
  RotateCcw,
  Trash2,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PeopleInput } from "./people-input";
import { ResultView } from "./result-view";
import { calculateDetailDutchPay, calculateDutchPay } from "@/lib/calculator";
import type { CalculationResult, DetailItemPortion, DetailSplitMode, Person, SplitItem, SplitItemCategory } from "@/lib/types";

type Step = "people" | "method" | "quick" | "detail" | "result";
type CalculationMethod = "quick" | "detail";
type DetailStep = "total" | "items" | "split" | "review";
type DiscountInputMode = "amount" | "percent";

const MAX_MONEY = 999_999_999_999;

const itemCategoryOptions: Array<{
  category: SplitItemCategory;
  label: string;
  defaultName: string;
  helper: string;
}> = [
  { category: "food", label: "음식", defaultName: "음식", helper: "누가 같이 먹었나요?" },
  { category: "alcohol", label: "술", defaultName: "술", helper: "누가 마셨나요?" },
  { category: "drink", label: "음료", defaultName: "음료", helper: "누가 마셨나요?" },
  { category: "dessert", label: "디저트", defaultName: "디저트", helper: "누가 먹었나요?" },
  { category: "taxi", label: "택시", defaultName: "택시", helper: "누가 같이 탔나요?" },
  { category: "stay", label: "숙소", defaultName: "숙소", helper: "누가 같이 이용했나요?" },
  { category: "etc", label: "기타", defaultName: "기타", helper: "누가 함께 부담하나요?" },
];

function displayName(person: Person, index: number): string {
  return person.name.trim() || `참여자 ${index + 1}`;
}

function parseMoneyInput(value: string): number {
  const onlyDigits = value.replace(/[^0-9]/g, "");
  if (onlyDigits === "") return 0;

  return Math.min(MAX_MONEY, Number(onlyDigits));
}

function parseQuantityInput(value: string): number {
  const normalized = value.replace(/[^0-9.]/g, "");
  const firstDotIndex = normalized.indexOf(".");
  const safeValue =
    firstDotIndex >= 0
      ? normalized.slice(0, firstDotIndex + 1) + normalized.slice(firstDotIndex + 1).replace(/\./g, "")
      : normalized;

  if (safeValue === "" || safeValue === ".") return 0;

  return Math.min(9999, Number(safeValue) || 0);
}

function parsePercentInput(value: string): number {
  const normalized = value.replace(/[^0-9.]/g, "");
  const firstDotIndex = normalized.indexOf(".");
  const safeValue =
    firstDotIndex >= 0
      ? normalized.slice(0, firstDotIndex + 1) + normalized.slice(firstDotIndex + 1).replace(/\./g, "")
      : normalized;

  if (safeValue === "" || safeValue === ".") return 0;

  return Math.min(999, Number(safeValue) || 0);
}

function calculatePercentDiscount(totalAmount: number, percent: number): number {
  const safeTotalAmount = Math.max(0, Math.floor(Number(totalAmount) || 0));
  const safePercent = Math.max(0, Number(percent) || 0);

  return Math.min(safeTotalAmount, Math.floor((safeTotalAmount * safePercent) / 100));
}

function createId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function getCategoryLabel(category: SplitItemCategory): string {
  return itemCategoryOptions.find((option) => option.category === category)?.label ?? "기타";
}

function getCategoryHelper(category: SplitItemCategory): string {
  return itemCategoryOptions.find((option) => option.category === category)?.helper ?? "누가 함께 부담하나요?";
}

function getCategoryPlaceholder(category: SplitItemCategory): string {
  switch (category) {
    case "food":
      return "예: 치킨, 안주, 감자튀김";
    case "alcohol":
      return "예: 카스, 테라, 소주, 하이볼";
    case "drink":
      return "예: 콜라, 사이다, 아메리카노";
    case "dessert":
      return "예: 케이크, 아이스크림, 빙수";
    case "taxi":
      return "예: 택시비, 대리비";
    case "stay":
      return "예: 숙소비, 펜션비";
    default:
      return "예: 직접 입력";
  }
}

function getDefaultQuantityUnit(category: SplitItemCategory): string {
  if (category === "alcohol") return "병";
  if (category === "drink") return "잔";
  return "개";
}

function makeDefaultPortion(people: Person[], quantity = 1): DetailItemPortion {
  return {
    id: createId("portion"),
    quantity,
    participantIds: people.map((person) => person.id),
  };
}


function updateIdsForDirectPayerChange(
  ids: string[],
  previousDirectPayerId: string,
  nextDirectPayerId: string,
  people: Person[]
): string[] {
  const selectedIds = new Set(ids);

  if (previousDirectPayerId) {
    selectedIds.add(previousDirectPayerId);
  }

  if (nextDirectPayerId) {
    selectedIds.delete(nextDirectPayerId);
  }

  return people
    .map((person) => person.id)
    .filter((personId) => selectedIds.has(personId));
}

function makeDefaultItem(category: SplitItemCategory, people: Person[]): SplitItem {
  return {
    id: createId("item"),
    name: "",
    category,
    amount: 0,
    directPayerId: "",
    directCoveredAmount: 0,
    splitMode: "equal",
    participantIds: people.map((person) => person.id),
    totalQuantity: 1,
    quantityUnit: category === "alcohol" ? "병" : category === "drink" ? "잔" : "개",
    portions: [makeDefaultPortion(people, 1)],
  };
}

export function DutchPayCalculator() {
  const [step, setStep] = useState<Step>("people");
  const [calculationMethod, setCalculationMethod] = useState<CalculationMethod>("quick");
  const [people, setPeople] = useState<Person[]>([]);
  const [mainPayerId, setMainPayerId] = useState("");
  const [result, setResult] = useState<CalculationResult | null>(null);

  const [quickTotalAmount, setQuickTotalAmount] = useState(0);
  const [quickDiscountMode, setQuickDiscountMode] = useState<DiscountInputMode>("amount");
  const [quickDiscountAmount, setQuickDiscountAmount] = useState(0);
  const [quickDiscountPercent, setQuickDiscountPercent] = useState(0);
  const [coveredAmount, setCoveredAmount] = useState(0);
  const [splitParticipantIds, setSplitParticipantIds] = useState<string[]>([]);

  const [detailTotalAmount, setDetailTotalAmount] = useState(0);
  const [detailDiscountMode, setDetailDiscountMode] = useState<DiscountInputMode>("amount");
  const [detailDiscountAmount, setDetailDiscountAmount] = useState(0);
  const [detailDiscountPercent, setDetailDiscountPercent] = useState(0);
  const [items, setItems] = useState<SplitItem[]>([]);
  const [detailStep, setDetailStep] = useState<DetailStep>("total");
  const itemCardRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [pendingFocusItemId, setPendingFocusItemId] = useState<string | null>(null);

  const hasAnyInput =
    people.length > 0 ||
    quickTotalAmount > 0 ||
    quickDiscountMode !== "amount" ||
    quickDiscountAmount > 0 ||
    quickDiscountPercent > 0 ||
    coveredAmount > 0 ||
    detailTotalAmount > 0 ||
    detailDiscountMode !== "amount" ||
    detailDiscountAmount > 0 ||
    detailDiscountPercent > 0 ||
    items.length > 0 ||
    result !== null;

  const quickDiscountValue =
    quickDiscountMode === "amount"
      ? Math.min(quickDiscountAmount, quickTotalAmount)
      : calculatePercentDiscount(quickTotalAmount, quickDiscountPercent);
  const quickDiscountPercentInvalid = quickDiscountMode === "percent" && quickDiscountPercent > 100;
  const quickSettlementAmount = Math.max(0, quickTotalAmount - quickDiscountValue);
  const quickRemainingAmount = Math.max(0, quickSettlementAmount - coveredAmount);
  const canGoMethodStep = people.length >= 2;

  const mainPayerIndex = people.findIndex((person) => person.id === mainPayerId);
  const mainPayerName =
    mainPayerIndex >= 0 ? displayName(people[mainPayerIndex], mainPayerIndex) : "대표 결제자";

  const getPersonNameById = (personId: string) => {
    const personIndex = people.findIndex((person) => person.id === personId);
    return personIndex >= 0 ? displayName(people[personIndex], personIndex) : "참여자";
  };

  const detailItemTotalAmount = useMemo(
    () => items.reduce((sum, item) => sum + Math.max(0, Math.floor(item.amount || 0)), 0),
    [items]
  );
  const detailDirectSupportTotal = useMemo(
    () =>
      items.reduce(
        (sum, item) => sum + Math.min(Math.max(0, Math.floor(item.directCoveredAmount || 0)), Math.max(0, Math.floor(item.amount || 0))),
        0
      ),
    [items]
  );
  const detailDiscountValue =
    detailDiscountMode === "amount"
      ? Math.min(detailDiscountAmount, detailTotalAmount)
      : calculatePercentDiscount(detailTotalAmount, detailDiscountPercent);
  const detailDiscountPercentInvalid = detailDiscountMode === "percent" && detailDiscountPercent > 100;
  const detailSettlementAmount = Math.max(0, detailTotalAmount - detailDiscountValue);
  const detailItemDifferenceAmount = detailSettlementAmount - detailItemTotalAmount;
  const canGoDetailItemsStep =
    detailTotalAmount > 0 &&
    !detailDiscountPercentInvalid &&
    detailDiscountValue <= detailTotalAmount &&
    !!mainPayerId;
  const canGoDetailSplitStep =
    detailSettlementAmount === 0
      ? detailItemDifferenceAmount === 0
      : items.length > 0 && detailItemTotalAmount > 0 && detailItemDifferenceAmount === 0;

  const quickSplitPreviewAmount = useMemo(() => {
    if (splitParticipantIds.length === 0) return 0;
    return Math.floor(quickRemainingAmount / splitParticipantIds.length);
  }, [quickRemainingAmount, splitParticipantIds.length]);

  const quickSplitPreviewRemainder = useMemo(() => {
    if (splitParticipantIds.length === 0) return 0;
    return quickRemainingAmount % splitParticipantIds.length;
  }, [quickRemainingAmount, splitParticipantIds.length]);

  const quickValidationErrors = useMemo(() => {
    const errors: string[] = [];

    if (people.length < 2) {
      errors.push("정산하려면 참여자가 2명 이상 필요합니다.");
    }

    if (quickTotalAmount <= 0) {
      errors.push("총 금액을 1원 이상 입력해주세요.");
    }

    if (quickDiscountMode === "amount" && quickDiscountAmount > quickTotalAmount) {
      errors.push("할인 금액은 총 금액보다 클 수 없습니다.");
    }

    if (quickDiscountPercentInvalid) {
      errors.push("할인 비율은 100%를 넘을 수 없습니다.");
    }

    if (!mainPayerId) {
      errors.push("먼저 계산한 사람을 선택해주세요.");
    }

    if (coveredAmount > quickSettlementAmount) {
      errors.push("직접 부담할 금액은 정산 대상 금액보다 클 수 없습니다.");
    }

    if (quickRemainingAmount > 0 && splitParticipantIds.length === 0) {
      errors.push("남은 금액을 나눠 낼 사람을 1명 이상 선택해주세요.");
    }

    return errors;
  }, [
    people.length,
    quickTotalAmount,
    quickDiscountMode,
    quickDiscountAmount,
    quickDiscountPercentInvalid,
    mainPayerId,
    coveredAmount,
    quickSettlementAmount,
    quickRemainingAmount,
    splitParticipantIds.length,
  ]);

  const detailValidationErrors = useMemo(() => {
    const errors: string[] = [];

    if (people.length < 2) {
      errors.push("정산하려면 참여자가 2명 이상 필요합니다.");
    }

    if (!mainPayerId) {
      errors.push("먼저 계산한 사람을 선택해주세요.");
    }

    if (detailSettlementAmount > 0 && items.length === 0) {
      errors.push("상세 계산에서는 항목을 1개 이상 추가해주세요.");
    }

    if (detailTotalAmount <= 0) {
      errors.push("총 결제금액을 1원 이상 입력해주세요.");
    }

    if (detailDiscountMode === "amount" && detailDiscountAmount > detailTotalAmount) {
      errors.push("할인 금액은 총 결제금액보다 클 수 없습니다.");
    }

    if (detailDiscountPercentInvalid) {
      errors.push("할인 비율은 100%를 넘을 수 없습니다.");
    }

    if (detailSettlementAmount > 0 && detailItemTotalAmount <= 0) {
      errors.push("항목 금액 합계가 1원 이상이어야 합니다.");
    }

    if (detailItemDifferenceAmount > 0) {
      errors.push(`계산이 맞지 않아요. 실제로 나눌 금액보다 항목 합계가 ${detailItemDifferenceAmount.toLocaleString()}원 부족합니다.`);
    }

    if (detailItemDifferenceAmount < 0) {
      errors.push(`계산이 맞지 않아요. 항목 합계가 실제로 나눌 금액보다 ${Math.abs(detailItemDifferenceAmount).toLocaleString()}원 많습니다.`);
    }

    items.forEach((item, index) => {
      const itemName = item.name.trim() || `항목 ${index + 1}`;

      if (item.amount <= 0) {
        errors.push(`${itemName} 금액을 1원 이상 입력해주세요.`);
      }

      if (item.directCoveredAmount > 0 && !item.directPayerId) {
        errors.push(`${itemName}의 직접 부담자를 선택해주세요.`);
      }

      if (item.directCoveredAmount > item.amount) {
        errors.push(`${itemName}의 직접 부담 금액은 항목 금액보다 클 수 없습니다.`);
      }

      const itemRemainingAmount = Math.max(0, item.amount - item.directCoveredAmount);
      if (itemRemainingAmount === 0) {
        return;
      }

      if (item.splitMode === "equal") {
        if (item.participantIds.length === 0) {
          errors.push(`${itemName}에 참여자를 1명 이상 선택해주세요.`);
        }
        return;
      }

      if (item.totalQuantity <= 0) {
        errors.push(`${itemName}의 총 수량을 0보다 크게 입력해주세요.`);
      }

      if (item.portions.length === 0) {
        errors.push(`${itemName}에 먹은 양 분배를 1개 이상 추가해주세요.`);
      }

      item.portions.forEach((portion, portionIndex) => {
        if (portion.quantity <= 0) {
          errors.push(`${itemName}의 ${portionIndex + 1}번째 분배 수량을 입력해주세요.`);
        }

        if (portion.participantIds.length === 0) {
          errors.push(`${itemName}의 ${portionIndex + 1}번째 분배 참여자를 선택해주세요.`);
        }
      });

      const distributedQuantity = item.portions.reduce((sum, portion) => sum + (Number(portion.quantity) || 0), 0);
      if (Math.abs(distributedQuantity - item.totalQuantity) > 0.000001) {
        errors.push(`${itemName}의 총 수량과 배분된 수량이 맞지 않습니다.`);
      }
    });

    return errors;
  }, [
    people.length,
    mainPayerId,
    items,
    detailTotalAmount,
    detailDiscountMode,
    detailDiscountAmount,
    detailDiscountPercentInvalid,
    detailSettlementAmount,
    detailItemTotalAmount,
    detailItemDifferenceAmount,
  ]);

  const canCalculateQuick = quickValidationErrors.length === 0;
  const canCalculateDetail = detailValidationErrors.length === 0;

  useEffect(() => {
    if (people.length === 0) {
      setMainPayerId("");
      setSplitParticipantIds([]);
      setItems([]);
      return;
    }

    setMainPayerId((current) => {
      if (current && people.some((person) => person.id === current)) return current;
      return people[0].id;
    });

    setSplitParticipantIds((current) => {
      const validCurrent = current.filter((id) => people.some((person) => person.id === id));
      if (validCurrent.length > 0) return validCurrent;
      return people.slice(1).map((person) => person.id);
    });

    setItems((currentItems) => {
      const validPersonIds = new Set(people.map((person) => person.id));
      return currentItems.map((item) => {
        const validParticipants = item.participantIds.filter((id) => validPersonIds.has(id));
        const validPortions = item.portions.map((portion) => {
          const portionParticipants = portion.participantIds.filter((id) => validPersonIds.has(id));
          return {
            ...portion,
            participantIds: portionParticipants.length > 0 ? portionParticipants : people.map((person) => person.id),
          };
        });

        return {
          ...item,
          directPayerId: item.directPayerId && validPersonIds.has(item.directPayerId) ? item.directPayerId : "",
          participantIds: validParticipants.length > 0 ? validParticipants : people.map((person) => person.id),
          portions: validPortions.length > 0 ? validPortions : [makeDefaultPortion(people, item.totalQuantity || 1)],
        };
      });
    });
  }, [people]);

  useEffect(() => {
    if (!mainPayerId) return;

    setSplitParticipantIds(
      people.filter((person) => person.id !== mainPayerId).map((person) => person.id)
    );
  }, [mainPayerId, people]);

  useEffect(() => {
    if (!pendingFocusItemId || detailStep !== "items") return;

    const timer = window.setTimeout(() => {
      const target = itemCardRefs.current[pendingFocusItemId];
      target?.scrollIntoView({ behavior: "smooth", block: "center" });
      const input = target?.querySelector<HTMLInputElement>("input[data-item-name='true']");
      input?.focus();
      setPendingFocusItemId(null);
    }, 50);

    return () => window.clearTimeout(timer);
  }, [pendingFocusItemId, detailStep]);

  const goMethodStep = () => {
    if (!canGoMethodStep) return;
    setStep("method");
  };

  const selectMethod = (method: CalculationMethod) => {
    setCalculationMethod(method);
  };

  const startSelectedMethod = () => {
    if (calculationMethod === "quick") {
      setStep("quick");
      return;
    }

    setDetailStep("total");
    setStep("detail");
  };

  const toggleSplitParticipant = (personId: string, checked: boolean) => {
    setSplitParticipantIds((current) => {
      if (checked) {
        return current.includes(personId) ? current : [...current, personId];
      }
      return current.filter((id) => id !== personId);
    });
  };

  const selectAllSplitParticipants = () => {
    setSplitParticipantIds(people.map((person) => person.id));
  };

  const selectExceptMainPayer = () => {
    setSplitParticipantIds(
      people.filter((person) => person.id !== mainPayerId).map((person) => person.id)
    );
  };

  const addItem = (category: SplitItemCategory) => {
    const newItem = makeDefaultItem(category, people);
    setItems((current) => [...current, newItem]);
    setPendingFocusItemId(newItem.id);
  };

  const updateItem = (itemId: string, updater: (item: SplitItem) => SplitItem) => {
    setItems((current) => current.map((item) => (item.id === itemId ? updater(item) : item)));
  };

  const removeItem = (itemId: string) => {
    setItems((current) => current.filter((item) => item.id !== itemId));
  };

  const toggleItemParticipant = (itemId: string, personId: string, checked: boolean) => {
    updateItem(itemId, (item) => {
      if (checked) {
        return item.participantIds.includes(personId)
          ? item
          : { ...item, participantIds: [...item.participantIds, personId] };
      }

      return {
        ...item,
        participantIds: item.participantIds.filter((id) => id !== personId),
      };
    });
  };

  const selectAllItemParticipants = (itemId: string) => {
    updateItem(itemId, (item) => ({ ...item, participantIds: people.map((person) => person.id) }));
  };

  const clearAllItemParticipants = (itemId: string) => {
    updateItem(itemId, (item) => ({ ...item, participantIds: [] }));
  };

  const updateItemSplitMode = (itemId: string, splitMode: DetailSplitMode) => {
    updateItem(itemId, (item) => ({
      ...item,
      splitMode,
      portions: item.portions.length > 0 ? item.portions : [makeDefaultPortion(people, item.totalQuantity || 1)],
    }));
  };

  const addItemPortion = (itemId: string) => {
    updateItem(itemId, (item) => ({
      ...item,
      portions: [...item.portions, makeDefaultPortion(people, 1)],
    }));
  };

  const updateItemPortion = (
    itemId: string,
    portionId: string,
    updater: (portion: DetailItemPortion) => DetailItemPortion
  ) => {
    updateItem(itemId, (item) => ({
      ...item,
      portions: item.portions.map((portion) =>
        portion.id === portionId ? updater(portion) : portion
      ),
    }));
  };

  const removeItemPortion = (itemId: string, portionId: string) => {
    updateItem(itemId, (item) => ({
      ...item,
      portions: item.portions.filter((portion) => portion.id !== portionId),
    }));
  };

  const toggleItemPortionParticipant = (
    itemId: string,
    portionId: string,
    personId: string,
    checked: boolean
  ) => {
    updateItemPortion(itemId, portionId, (portion) => {
      if (checked) {
        return portion.participantIds.includes(personId)
          ? portion
          : { ...portion, participantIds: [...portion.participantIds, personId] };
      }

      return {
        ...portion,
        participantIds: portion.participantIds.filter((id) => id !== personId),
      };
    });
  };

  const selectAllPortionParticipants = (itemId: string, portionId: string) => {
    updateItemPortion(itemId, portionId, (portion) => ({
      ...portion,
      participantIds: people.map((person) => person.id),
    }));
  };

  const clearAllPortionParticipants = (itemId: string, portionId: string) => {
    updateItemPortion(itemId, portionId, (portion) => ({
      ...portion,
      participantIds: [],
    }));
  };

  const handleCalculateQuick = () => {
    if (!canCalculateQuick) return;

    const calculationResult = calculateDutchPay({
      totalAmount: quickTotalAmount,
      discountAmount: quickDiscountValue,
      people,
      mainPayerId,
      coveredAmount,
      splitParticipantIds,
    });

    setResult(calculationResult);
    setStep("result");
  };

  const handleCalculateDetail = () => {
    if (!canCalculateDetail) return;

    const calculationResult = calculateDetailDutchPay({
      totalAmount: detailTotalAmount,
      discountAmount: detailDiscountValue,
      people,
      mainPayerId,
      items,
    });

    setResult(calculationResult);
    setStep("result");
  };

  const handleReset = () => {
    setStep("people");
    setCalculationMethod("quick");
    setPeople([]);
    setMainPayerId("");
    setResult(null);
    setQuickTotalAmount(0);
    setQuickDiscountMode("amount");
    setQuickDiscountAmount(0);
    setQuickDiscountPercent(0);
    setCoveredAmount(0);
    setSplitParticipantIds([]);
    setDetailTotalAmount(0);
    setDetailDiscountMode("amount");
    setDetailDiscountAmount(0);
    setDetailDiscountPercent(0);
    setItems([]);
    setDetailStep("total");
  };

  const editCurrentInput = () => {
    setStep(calculationMethod === "quick" ? "quick" : "detail");
  };

  const renderMainPayerPicker = () => (
    <section className="space-y-3">
      <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
        누가 먼저 계산했나요?
      </h3>
      <div className="grid grid-cols-2 gap-2">
        {people.map((person, index) => (
          <button
            key={person.id}
            type="button"
            onClick={() => setMainPayerId(person.id)}
            className={
              person.id === mainPayerId
                ? "p-3 rounded-xl border border-primary bg-primary/10 text-primary font-semibold text-left"
                : "p-3 rounded-xl border border-border bg-card hover:bg-muted/50 text-left"
            }
          >
            {displayName(person, index)}
          </button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        전체 금액을 먼저 결제한 사람을 선택해주세요. 정산 결과에서 이 사람이 돈을 받게 됩니다.
      </p>
    </section>
  );

  const renderValidationErrors = (errors: string[]) =>
    errors.length > 0 && (
      <section className="p-4 border border-destructive/30 bg-destructive/5 rounded-2xl space-y-3">
        <div className="flex items-center gap-2 text-destructive font-medium">
          <AlertCircle className="w-4 h-4" />
          <p>계산 전에 확인해주세요</p>
        </div>
        <ul className="space-y-1 text-sm text-destructive">
          {errors.map((error) => (
            <li key={error}>• {error}</li>
          ))}
        </ul>
      </section>
    );

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-sm border-b border-border">
        <div className="max-w-lg mx-auto px-4 py-4 flex items-center gap-3">
          <div className="p-2 bg-primary rounded-xl">
            <Wallet className="w-5 h-5 text-primary-foreground" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="font-bold text-lg text-foreground">n0.cal</h1>
            <p className="text-xs text-muted-foreground">빠른 계산과 항목별 정산을 쉽게</p>
          </div>
          {hasAnyInput && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleReset}
              className="shrink-0 text-muted-foreground"
            >
              <RotateCcw className="w-4 h-4 mr-1" />
              초기화
            </Button>
          )}
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-6 pb-24">
        {step === "people" && (
          <div className="space-y-6">
            <div className="space-y-2">
              <p className="text-sm text-primary font-medium">1단계</p>
              <h2 className="text-2xl font-bold">누구와 정산하나요?</h2>
              <p className="text-muted-foreground">
                먼저 참여자를 입력하세요. 다음 단계에서 빠른 계산 또는 상세 계산을 선택합니다.
              </p>
            </div>

            <PeopleInput people={people} onChange={setPeople} />

            <div className="sticky bottom-4 z-20 space-y-2 p-3 bg-background/90 backdrop-blur border border-border rounded-2xl shadow-lg">
              <Button onClick={goMethodStep} disabled={!canGoMethodStep} className="w-full h-14 text-lg">
                다음
                <ArrowRight className="w-5 h-5 ml-2" />
              </Button>

              {!canGoMethodStep && (
                <p className="text-center text-sm text-muted-foreground">
                  정산하려면 참여자가 2명 이상 필요합니다.
                </p>
              )}
            </div>
          </div>
        )}

        {step === "method" && (
          <div className="space-y-6">
            <div className="space-y-2">
              <p className="text-sm text-primary font-medium">2단계</p>
              <h2 className="text-2xl font-bold">어떻게 계산할까요?</h2>
              <p className="text-muted-foreground">
                간단하게 n분의 1로 더치페이 하는 경우는 빠른 계산에서, 술·음료처럼 항목별로 나누는 계산은 상세 계산에서 처리합니다.
              </p>
            </div>

            <div className="grid gap-3">
              <button
                type="button"
                onClick={() => selectMethod("quick")}
                className={
                  calculationMethod === "quick"
                    ? "p-5 text-left rounded-2xl border border-primary bg-primary/10 hover:bg-primary/15"
                    : "p-5 text-left rounded-2xl border border-border bg-card hover:bg-muted/50"
                }
              >
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-primary text-primary-foreground rounded-xl">
                    <Gift className="w-5 h-5" />
                  </div>
                  <div>
                    <h3
                      className={
                        calculationMethod === "quick"
                          ? "text-lg font-bold text-primary"
                          : "text-lg font-bold"
                      }
                    >
                      빠른 계산
                    </h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      총액을 단순하게 N분의 1로 나눌 수도 있고, 일부 금액은 대표 결제자가 부담하게 할 수도 있어요.
                    </p>
                    <p className="text-xs text-muted-foreground mt-2">
                      예: “안주값은 내가 낼게. 나머지는 너희가 나눠 내.”
                    </p>
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => selectMethod("detail")}
                className={
                  calculationMethod === "detail"
                    ? "p-5 text-left rounded-2xl border border-primary bg-primary/10 hover:bg-primary/15"
                    : "p-5 text-left rounded-2xl border border-border bg-card hover:bg-muted/50"
                }
              >
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-muted rounded-xl">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div>
                    <h3
                      className={
                        calculationMethod === "detail"
                          ? "text-lg font-bold text-primary"
                          : "text-lg font-bold"
                      }
                    >
                      상세 계산
                    </h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      음식, 술, 음료, 택시처럼 항목별로 참여자를 다르게 선택해요.
                    </p>
                    <p className="text-xs text-muted-foreground mt-2">
                      예: “맥주는 A랑 B가 마시고, 소주는 A랑 C가 마셨어”
                    </p>
                  </div>
                </div>
              </button>
            </div>

            <div className="sticky bottom-4 z-20 flex gap-3 p-3 bg-background/90 backdrop-blur border border-border rounded-2xl shadow-lg">
              <Button
                variant="outline"
                onClick={() => setStep("people")}
                className="flex-1 h-12"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                이전
              </Button>

              <Button onClick={startSelectedMethod} className="flex-1 h-12">
                {calculationMethod === "quick"
                  ? "빠른 계산 시작하기"
                  : "상세 계산 시작하기"}
              </Button>
            </div>
          </div>
        )}

        {step === "quick" && (
          <div className="space-y-6">
            <div className="space-y-2">
              <p className="text-sm text-primary font-medium">빠른 계산</p>
              <h2 className="text-2xl font-bold">일부는 내가 낼게</h2>
              <p className="text-muted-foreground">
                단순하게 N분의 1로 나누거나, 대표 결제자가 일부 금액을 직접 부담하고 남은 금액만 선택한 사람들이 나눠 낼 수 있습니다.
              </p>
              <p className="text-sm text-muted-foreground">
                단순 N분의 1만 하려면 직접 부담 금액은 0원으로 두고, 나눠 낼 사람을 전체 선택하세요.
              </p>
            </div>

            <section className="p-4 border border-dashed border-border rounded-2xl bg-muted/30 space-y-2">
              <div className="flex items-center gap-2 font-medium">
                <ReceiptText className="w-4 h-4" />
                <span>영수증으로 불러오기</span>
              </div>
              <p className="text-sm text-muted-foreground">
                빠른 계산에서는 영수증에서 총액과 할인 금액을 자동으로 불러오는 기능으로 붙일 예정입니다.
              </p>
              <Button type="button" variant="outline" size="sm" disabled>
                준비 중
              </Button>
            </section>

            <section className="space-y-3">
              <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                총 얼마가 나왔나요?
              </h3>
              <div className="relative">
                <Input
                  type="text"
                  inputMode="numeric"
                  value={quickTotalAmount || ""}
                  onChange={(event) => setQuickTotalAmount(parseMoneyInput(event.target.value))}
                  placeholder="0"
                  className="text-2xl font-bold h-16 pl-16 pr-12 text-right"
                />
                {quickTotalAmount > 0 && (
                  <button
                    type="button"
                    onClick={() => setQuickTotalAmount(0)}
                    className="absolute left-3 top-1/2 -translate-y-1/2 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
                  >
                    초기화
                  </button>
                )}
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground font-medium">
                  원
                </span>
              </div>
            </section>

            <section className="space-y-3">
              <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                쿠폰 / 할인
              </h3>

              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant={quickDiscountMode === "amount" ? "default" : "outline"}
                  onClick={() => setQuickDiscountMode("amount")}
                  className="h-11"
                >
                  금액 할인
                </Button>
                <Button
                  type="button"
                  variant={quickDiscountMode === "percent" ? "default" : "outline"}
                  onClick={() => setQuickDiscountMode("percent")}
                  className="h-11"
                >
                  퍼센트 할인
                </Button>
              </div>

              <div className="relative">
                {quickDiscountMode === "amount" ? (
                  <>
                    <Input
                      type="text"
                      inputMode="numeric"
                      value={quickDiscountAmount || ""}
                      onChange={(event) => setQuickDiscountAmount(parseMoneyInput(event.target.value))}
                      placeholder="입력하지 않으면 0원"
                      className="h-14 pl-16 pr-12 text-right"
                    />
                    {quickDiscountAmount > 0 && (
                      <button
                        type="button"
                        onClick={() => setQuickDiscountAmount(0)}
                        className="absolute left-3 top-1/2 -translate-y-1/2 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
                      >
                        초기화
                      </button>
                    )}
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground font-medium">
                      원
                    </span>
                  </>
                ) : (
                  <>
                    <Input
                      type="text"
                      inputMode="decimal"
                      value={quickDiscountPercent || ""}
                      onChange={(event) => setQuickDiscountPercent(parsePercentInput(event.target.value))}
                      placeholder="예: 10"
                      className="h-14 pl-16 pr-12 text-right"
                    />
                    {quickDiscountPercent > 0 && (
                      <button
                        type="button"
                        onClick={() => setQuickDiscountPercent(0)}
                        className="absolute left-3 top-1/2 -translate-y-1/2 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
                      >
                        초기화
                      </button>
                    )}
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground font-medium">
                      %
                    </span>
                  </>
                )}
              </div>

              {quickDiscountMode === "percent" && (
                <p className={quickDiscountPercentInvalid ? "text-xs text-destructive font-medium" : "text-xs text-muted-foreground"}>
                  {quickDiscountPercentInvalid
                    ? "할인 비율은 100%를 넘을 수 없습니다."
                    : `총액 ${quickTotalAmount.toLocaleString()}원의 ${quickDiscountPercent || 0}% 할인 = ${quickDiscountValue.toLocaleString()}원 할인`}
                </p>
              )}
            </section>

            {renderMainPayerPicker()}

            <section className="space-y-3 p-4 border border-border bg-card rounded-2xl">
              <div className="flex items-start gap-3">
                <div className="p-2 bg-primary/10 text-primary rounded-xl shrink-0">
                  <Gift className="w-5 h-5" />
                </div>
                <div className="space-y-1">
                  <h3 className="font-semibold">{mainPayerName}님이 직접 부담할 금액</h3>
                  <p className="text-sm text-muted-foreground">
                    예: “안주값 30,000원은 내가 낼게”처럼 먼저 계산한 사람이 부담하기로 한 금액입니다.
                  </p>
                </div>
              </div>

              <div className="relative">
                <Input
                  type="text"
                  inputMode="numeric"
                  value={coveredAmount || ""}
                  onChange={(event) => setCoveredAmount(parseMoneyInput(event.target.value))}
                  placeholder="예: 30000"
                  className="h-14 pl-16 pr-12 text-right"
                />
                {coveredAmount > 0 && (
                  <button
                    type="button"
                    onClick={() => setCoveredAmount(0)}
                    className="absolute left-3 top-1/2 -translate-y-1/2 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
                  >
                    초기화
                  </button>
                )}
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground font-medium">
                  원
                </span>
              </div>
            </section>

            <section className="space-y-3">
              <div>
                <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                  남은 금액을 누가 나눠 내나요?
                </h3>
                <p className="text-sm text-muted-foreground mt-1">
                  먼저 계산한 사람도 남은 금액을 같이 나눠 낼 수 있습니다.
                </p>
              </div>

              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" onClick={selectExceptMainPayer}>
                  대표 결제자 제외
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={selectAllSplitParticipants}>
                  전체 선택
                </Button>
              </div>

              <div className="space-y-2">
                {people.map((person, index) => {
                  const checked = splitParticipantIds.includes(person.id);
                  return (
                    <label
                      key={person.id}
                      className={
                        checked
                          ? "flex items-center gap-3 p-3 rounded-xl border border-primary bg-primary/10 cursor-pointer"
                          : "flex items-center gap-3 p-3 rounded-xl border border-border bg-card cursor-pointer hover:bg-muted/50"
                      }
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(event) => toggleSplitParticipant(person.id, event.target.checked)}
                        className="h-4 w-4 rounded border-border"
                      />
                      <span className="font-medium">{displayName(person, index)}</span>
                      {person.id === mainPayerId && (
                        <span className="ml-auto text-xs bg-primary/10 text-primary px-2 py-1 rounded-full">
                          대표 결제자
                        </span>
                      )}
                    </label>
                  );
                })}
              </div>
            </section>

            <section className="p-4 bg-muted/50 rounded-xl space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">총 금액</span>
                <span className="font-medium">{quickTotalAmount.toLocaleString()}원</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">할인 금액</span>
                <span className="font-medium">-{quickDiscountValue.toLocaleString()}원</span>
              </div>
              <div className="flex justify-between text-sm pt-2 border-t border-border">
                <span className="text-muted-foreground">정산 대상 금액</span>
                <span className="font-semibold">{quickSettlementAmount.toLocaleString()}원</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{mainPayerName} 직접 부담</span>
                <span className="font-medium">-{coveredAmount.toLocaleString()}원</span>
              </div>
              <div className="flex justify-between text-sm pt-2 border-t border-border">
                <span className="text-muted-foreground">남은 금액</span>
                <span className="font-semibold">{quickRemainingAmount.toLocaleString()}원</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">나눠 낼 사람</span>
                <span className="font-medium">{splitParticipantIds.length}명</span>
              </div>
              {splitParticipantIds.length > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">예상 1인 부담</span>
                  <span className="font-medium">
                    {quickSplitPreviewAmount.toLocaleString()}원
                    {quickSplitPreviewRemainder > 0 && ` + 일부 ${quickSplitPreviewRemainder}명 1원`}
                  </span>
                </div>
              )}
            </section>

            {renderValidationErrors(quickValidationErrors)}

            <div className="sticky bottom-4 z-20 flex gap-3 p-3 bg-background/90 backdrop-blur border border-border rounded-2xl shadow-lg">
              <Button variant="outline" onClick={() => setStep("method")} className="flex-1 h-12">
                <ArrowLeft className="w-4 h-4 mr-2" />
                이전
              </Button>
              <Button onClick={handleCalculateQuick} disabled={!canCalculateQuick} className="flex-1 h-12">
                정산하기
              </Button>
            </div>
          </div>
        )}

        {step === "detail" && (
          <div className="space-y-6">
            <div className="space-y-2">
              <p className="text-sm text-primary font-medium">상세 계산</p>
              <h2 className="text-2xl font-bold">항목별로 나눠요</h2>
              <p className="text-muted-foreground">
                총액을 먼저 확인하고, 항목을 입력한 뒤, 각 항목을 어떻게 나눌지 정합니다.
              </p>
            </div>

            <section className="grid grid-cols-4 gap-2 text-center text-xs">
              {[
                { key: "total", label: "1 총액" },
                { key: "items", label: "2 항목" },
                { key: "split", label: "3 나누기" },
                { key: "review", label: "4 확인" },
              ].map((item) => (
                <div
                  key={item.key}
                  className={
                    detailStep === item.key
                      ? "rounded-full bg-primary text-primary-foreground px-2 py-2 font-semibold"
                      : "rounded-full bg-muted text-muted-foreground px-2 py-2"
                  }
                >
                  {item.label}
                </div>
              ))}
            </section>

            {detailStep === "total" && (
              <div className="space-y-6">
                <section className="p-4 border border-dashed border-border rounded-2xl bg-muted/30 space-y-2">
                  <div className="flex items-center gap-2 font-medium">
                    <ReceiptText className="w-4 h-4" />
                    <span>영수증으로 불러오기</span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    나중에는 영수증에서 총액, 할인, 항목을 자동으로 채우는 입력 보조 기능으로 붙입니다.
                  </p>
                  <Button type="button" variant="outline" size="sm" disabled>
                    준비 중
                  </Button>
                </section>

                <section className="space-y-4">
                  <div className="space-y-3">
                    <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                      총 얼마가 나왔나요?
                    </h3>
                    <div className="relative">
                      <Input
                        type="text"
                        inputMode="numeric"
                        value={detailTotalAmount || ""}
                        onChange={(event) => setDetailTotalAmount(parseMoneyInput(event.target.value))}
                        placeholder="영수증 또는 실제 결제금액"
                        className="text-2xl font-bold h-16 pl-16 pr-12 text-right"
                      />
                      {detailTotalAmount > 0 && (
                        <button
                          type="button"
                          onClick={() => setDetailTotalAmount(0)}
                          className="absolute left-3 top-1/2 -translate-y-1/2 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
                        >
                          초기화
                        </button>
                      )}
                      <span className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground font-medium">
                        원
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      할인 후 실제로 나눌 금액과 항목별 금액 합계가 맞아야 정산할 수 있습니다.
                    </p>
                  </div>

                  <div className="space-y-3">
                    <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                      쿠폰 / 할인
                    </h3>

                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        type="button"
                        variant={detailDiscountMode === "amount" ? "default" : "outline"}
                        onClick={() => setDetailDiscountMode("amount")}
                        className="h-11"
                      >
                        금액 할인
                      </Button>
                      <Button
                        type="button"
                        variant={detailDiscountMode === "percent" ? "default" : "outline"}
                        onClick={() => setDetailDiscountMode("percent")}
                        className="h-11"
                      >
                        퍼센트 할인
                      </Button>
                    </div>

                    <div className="relative">
                      {detailDiscountMode === "amount" ? (
                        <>
                          <Input
                            type="text"
                            inputMode="numeric"
                            value={detailDiscountAmount || ""}
                            onChange={(event) => setDetailDiscountAmount(parseMoneyInput(event.target.value))}
                            placeholder="입력하지 않으면 0원"
                            className="h-14 pl-16 pr-12 text-right"
                          />
                          {detailDiscountAmount > 0 && (
                            <button
                              type="button"
                              onClick={() => setDetailDiscountAmount(0)}
                              className="absolute left-3 top-1/2 -translate-y-1/2 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
                            >
                              초기화
                            </button>
                          )}
                          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground font-medium">
                            원
                          </span>
                        </>
                      ) : (
                        <>
                          <Input
                            type="text"
                            inputMode="decimal"
                            value={detailDiscountPercent || ""}
                            onChange={(event) => setDetailDiscountPercent(parsePercentInput(event.target.value))}
                            placeholder="예: 10"
                            className="h-14 pl-16 pr-12 text-right"
                          />
                          {detailDiscountPercent > 0 && (
                            <button
                              type="button"
                              onClick={() => setDetailDiscountPercent(0)}
                              className="absolute left-3 top-1/2 -translate-y-1/2 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
                            >
                              초기화
                            </button>
                          )}
                          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground font-medium">
                            %
                          </span>
                        </>
                      )}
                    </div>

                    <p className={detailDiscountPercentInvalid ? "text-xs text-destructive font-medium" : "text-xs text-muted-foreground"}>
                      {detailDiscountMode === "percent"
                        ? detailDiscountPercentInvalid
                          ? "할인 비율은 100%를 넘을 수 없습니다."
                          : `총액 ${detailTotalAmount.toLocaleString()}원의 ${detailDiscountPercent || 0}% 할인 = ${detailDiscountValue.toLocaleString()}원 할인`
                        : "할인 후 실제로 나눌 금액에 맞춰 항목 금액을 입력합니다."}
                    </p>
                  </div>
                </section>

                {renderMainPayerPicker()}

                <section className="p-4 bg-muted/50 rounded-xl space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">총 결제금액</span>
                    <span className="font-medium">{detailTotalAmount.toLocaleString()}원</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">할인 금액</span>
                    <span className="font-medium">-{detailDiscountValue.toLocaleString()}원</span>
                  </div>
                  <div className="flex justify-between text-sm pt-2 border-t border-border">
                    <span className="text-muted-foreground">실제로 나눌 금액</span>
                    <span className="font-semibold">{detailSettlementAmount.toLocaleString()}원</span>
                  </div>
                </section>

                {renderValidationErrors(
                  detailTotalAmount <= 0
                    ? ["총 결제금액을 1원 이상 입력해주세요."]
                    : detailDiscountMode === "amount" && detailDiscountAmount > detailTotalAmount
                      ? ["할인 금액은 총 결제금액보다 클 수 없습니다."]
                      : detailDiscountPercentInvalid
                        ? ["할인 비율은 100%를 넘을 수 없습니다."]
                        : !mainPayerId
                          ? ["먼저 계산한 사람을 선택해주세요."]
                          : []
                )}

                <div className="sticky bottom-4 z-20 flex gap-3 p-3 bg-background/90 backdrop-blur border border-border rounded-2xl shadow-lg">
                  <Button variant="outline" onClick={() => setStep("method")} className="flex-1 h-12">
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    이전
                  </Button>
                  <Button onClick={() => setDetailStep("items")} disabled={!canGoDetailItemsStep} className="flex-1 h-12">
                    다음: 항목 입력
                  </Button>
                </div>
              </div>
            )}

            {detailStep === "items" && (
              <div className="space-y-6">
                <section className="space-y-3">
                  <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                    항목 추가
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    먼저 영수증에 있는 항목을 하나씩 추가하세요. 음식/술/음료는 분류이고, 실제 이름은 카드 안에서 입력합니다.
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {itemCategoryOptions.map((option) => (
                      <Button
                        key={option.category}
                        type="button"
                        variant="outline"
                        onClick={() => addItem(option.category)}
                        className="h-11 justify-start"
                      >
                        <Plus className="w-4 h-4 mr-1" />
                        {option.label} 항목
                      </Button>
                    ))}
                  </div>
                </section>

                <section className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                      입력한 항목
                    </h3>
                    <p className="text-sm text-muted-foreground">{items.length}개</p>
                  </div>

                  {items.length === 0 ? (
                    <div className="p-5 text-center border border-dashed border-border rounded-2xl text-muted-foreground">
                      위의 버튼으로 항목을 먼저 추가해주세요.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {items.map((item, itemIndex) => (
                        <div
                          key={item.id}
                          ref={(element) => {
                            itemCardRefs.current[item.id] = element;
                          }}
                          className="p-4 border border-border bg-card rounded-2xl space-y-4"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="text-sm text-primary font-medium">{getCategoryLabel(item.category)} 항목</p>
                              <h4 className="font-semibold">{item.name.trim() || `새 항목 ${itemIndex + 1}`}</h4>
                              <p className="text-xs text-muted-foreground mt-1">항목명과 금액을 입력한 뒤, 필요한 경우 지원 금액을 설정하세요.</p>
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => removeItem(item.id)}
                              className="text-muted-foreground"
                            >
                              <Trash2 className="w-4 h-4 mr-1" />
                              삭제
                            </Button>
                          </div>

                          <div className="grid grid-cols-1 gap-3">
                            <div className="space-y-2">
                              <label className="text-sm text-muted-foreground">항목명</label>
                              <div className="relative">
                                <Input
                                  data-item-name="true"
                                  value={item.name}
                                  onChange={(event) => updateItem(item.id, (current) => ({ ...current, name: event.target.value }))}
                                  placeholder={getCategoryPlaceholder(item.category)}
                                  className="h-12 pl-20"
                                />
                                <button
                                  type="button"
                                  onClick={() => updateItem(item.id, (current) => ({ ...current, name: "" }))}
                                  className="absolute left-3 top-1/2 -translate-y-1/2 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
                                >
                                  초기화
                                </button>
                              </div>
                            </div>
                            <div className="space-y-2">
                              <label className="text-sm text-muted-foreground">금액</label>
                              <div className="relative">
                                <Input
                                  type="text"
                                  inputMode="numeric"
                                  value={item.amount || ""}
                                  onChange={(event) =>
                                    updateItem(item.id, (current) => ({ ...current, amount: parseMoneyInput(event.target.value) }))
                                  }
                                  placeholder="0"
                                  className="h-12 pl-16 pr-10 text-right"
                                />
                                {item.amount > 0 && (
                                  <button
                                    type="button"
                                    onClick={() => updateItem(item.id, (current) => ({ ...current, amount: 0 }))}
                                    className="absolute left-3 top-1/2 -translate-y-1/2 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
                                  >
                                    초기화
                                  </button>
                                )}
                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                                  원
                                </span>
                              </div>
                            </div>
                          </div>

                          <div className="space-y-3 rounded-xl border border-border bg-muted/20 p-3">
                            <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                              <input
                                type="checkbox"
                                checked={item.directCoveredAmount > 0 || !!item.directPayerId}
                                onChange={(event) =>
                                  updateItem(item.id, (current) => {
                                    if (!event.target.checked) {
                                      return {
                                        ...current,
                                        directPayerId: "",
                                        directCoveredAmount: 0,
                                      };
                                    }

                                    const nextDirectPayerId = current.directPayerId || mainPayerId || people[0]?.id || "";

                                    return {
                                      ...current,
                                      directPayerId: nextDirectPayerId,
                                      directCoveredAmount: current.directCoveredAmount,
                                      participantIds: nextDirectPayerId
                                        ? current.participantIds.filter((id) => id !== nextDirectPayerId)
                                        : current.participantIds,
                                      portions: current.portions.map((portion) => ({
                                        ...portion,
                                        participantIds: nextDirectPayerId
                                          ? portion.participantIds.filter((id) => id !== nextDirectPayerId)
                                          : portion.participantIds,
                                      })),
                                    };
                                  })
                                }
                                className="h-4 w-4 rounded border-border"
                              />
                              지원해주는 금액이 있나요?
                            </label>
                            <p className="text-xs text-muted-foreground">
                              예: “철수가 안주값 70,500원을 내줄게”처럼 특정 사람이 이 항목 일부를 부담하는 경우에 사용합니다.
                            </p>

                            {(item.directCoveredAmount > 0 || !!item.directPayerId) && (
                              <div className="space-y-3">
                                <div className="space-y-2">
                                  <p className="text-sm text-muted-foreground">누가 내주나요?</p>
                                  <div className="grid grid-cols-2 gap-2">
                                    {people.map((person, index) => (
                                      <button
                                        key={person.id}
                                        type="button"
                                        onClick={() =>
                                          updateItem(item.id, (current) => ({
                                            ...current,
                                            directPayerId: person.id,
                                            participantIds: updateIdsForDirectPayerChange(
                                              current.participantIds,
                                              current.directPayerId,
                                              person.id,
                                              people
                                            ),
                                            portions: current.portions.map((portion) => ({
                                              ...portion,
                                              participantIds: updateIdsForDirectPayerChange(
                                                portion.participantIds,
                                                current.directPayerId,
                                                person.id,
                                                people
                                              ),
                                            })),
                                          }))
                                        }
                                        className={
                                          item.directPayerId === person.id
                                            ? "p-2 rounded-lg border border-primary bg-primary/10 text-primary font-medium text-left text-sm"
                                            : "p-2 rounded-lg border border-border bg-card hover:bg-muted/50 text-left text-sm"
                                        }
                                      >
                                        {displayName(person, index)}
                                      </button>
                                    ))}
                                  </div>
                                </div>

                                <div className="space-y-2">
                                  <p className="text-sm text-muted-foreground">얼마를 내주나요?</p>
                                  <div className="relative">
                                    <Input
                                      type="text"
                                      inputMode="numeric"
                                      value={item.directCoveredAmount || ""}
                                      onChange={(event) =>
                                        updateItem(item.id, (current) => ({
                                          ...current,
                                          directCoveredAmount: parseMoneyInput(event.target.value),
                                        }))
                                      }
                                      placeholder="예: 30000"
                                      className="h-12 pl-16 pr-10 text-right"
                                    />
                                    {item.directCoveredAmount > 0 && (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          updateItem(item.id, (current) => ({
                                            ...current,
                                            directCoveredAmount: 0,
                                          }))
                                        }
                                        className="absolute left-3 top-1/2 -translate-y-1/2 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
                                      >
                                        초기화
                                      </button>
                                    )}
                                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                                      원
                                    </span>
                                  </div>
                                </div>

                                <div className="rounded-lg bg-background p-3 text-sm space-y-1">
                                  <div className="flex justify-between">
                                    <span className="text-muted-foreground">항목 금액</span>
                                    <span className="font-medium">{item.amount.toLocaleString()}원</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-muted-foreground">지원 금액</span>
                                    <span
                                      className={
                                        item.directCoveredAmount > item.amount
                                          ? "font-medium text-destructive"
                                          : "font-medium"
                                      }
                                    >
                                      -{item.directCoveredAmount.toLocaleString()}원
                                    </span>
                                  </div>
                                  <div className="flex justify-between border-t border-border pt-1">
                                    <span className="text-muted-foreground">나눌 금액</span>
                                    <span className="font-semibold">{Math.max(0, item.amount - item.directCoveredAmount).toLocaleString()}원</span>
                                  </div>

                                  {item.directCoveredAmount > item.amount && (
                                    <p className="pt-2 text-sm font-medium text-destructive">
                                      지원 금액은 항목 금액보다 클 수 없어요.
                                    </p>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                <section className="p-4 bg-muted/50 rounded-xl space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">실제로 나눌 금액</span>
                    <span className="font-medium">{detailSettlementAmount.toLocaleString()}원</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">항목 합계</span>
                    <span className="font-medium">{detailItemTotalAmount.toLocaleString()}원</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">지원 금액 합계</span>
                    <span className="font-medium">-{detailDirectSupportTotal.toLocaleString()}원</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">차액</span>
                    <span className={detailItemDifferenceAmount === 0 ? "font-medium" : "font-semibold text-destructive"}>
                      {Math.abs(detailItemDifferenceAmount).toLocaleString()}원
                    </span>
                  </div>
                  {detailItemDifferenceAmount !== 0 && (
                    <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive font-medium">
                      {detailItemDifferenceAmount > 0
                        ? `아직 입력하지 않은 금액이 있어요. 실제로 나눌 금액보다 항목 합계가 ${detailItemDifferenceAmount.toLocaleString()}원 부족합니다.`
                        : `항목 금액이 너무 커요. 항목 합계가 실제로 나눌 금액보다 ${Math.abs(detailItemDifferenceAmount).toLocaleString()}원 많습니다.`}
                    </div>
                  )}
                </section>

                <div className="sticky bottom-4 z-20 flex gap-3 p-3 bg-background/90 backdrop-blur border border-border rounded-2xl shadow-lg">
                  <Button variant="outline" onClick={() => setDetailStep("total")} className="flex-1 h-12">
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    이전
                  </Button>
                  <Button onClick={() => setDetailStep("split")} disabled={!canGoDetailSplitStep} className="flex-1 h-12">
                    다음: 나누기
                  </Button>
                </div>
              </div>
            )}

            {detailStep === "split" && (
              <div className="space-y-6">
                <section className="space-y-3">
                  <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                    항목별로 어떻게 나눌까요?
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    각 항목의 나눌 금액을 누가 부담할지 정하세요. 지원 금액이 있으면 그 금액을 뺀 나머지만 나눕니다.
                  </p>
                </section>

                {items.length === 0 ? (
                  <div className="p-5 text-center border border-dashed border-border rounded-2xl text-muted-foreground">
                    항목이 없습니다. 이전 단계에서 항목을 추가해주세요.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {items.map((item, itemIndex) => (
                      <div key={item.id} className="p-4 border border-border bg-card rounded-2xl space-y-4">
                        <div className="space-y-1">
                          <p className="text-sm text-primary font-medium">{getCategoryLabel(item.category)} 항목</p>
                          <h4 className="font-semibold">{item.name.trim() || `항목 ${itemIndex + 1}`}</h4>
                          <p className="text-sm text-muted-foreground">총 {item.amount.toLocaleString()}원</p>
                          {item.directCoveredAmount > 0 && (
                            <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-xs text-muted-foreground space-y-1">
                              <p className="font-medium text-primary">
                                {item.directPayerId
                                  ? `${getPersonNameById(item.directPayerId)}님이 ${Math.min(item.directCoveredAmount, item.amount).toLocaleString()}원을 지원했어요.`
                                  : `${Math.min(item.directCoveredAmount, item.amount).toLocaleString()}원 지원금이 있어요.`}
                              </p>
                              <p>
                                나머지 {Math.max(0, item.amount - item.directCoveredAmount).toLocaleString()}원만 아래 사람들이 나눠 냅니다.
                              </p>
                            </div>
                          )}
                        </div>

                        <div className="space-y-2">
                          <p className="text-sm font-medium">어떻게 나눌까요?</p>
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              onClick={() => updateItemSplitMode(item.id, "equal")}
                              className={
                                item.splitMode === "equal"
                                  ? "rounded-xl border border-primary bg-primary/10 p-3 text-left"
                                  : "rounded-xl border border-border bg-card p-3 text-left hover:bg-muted/50"
                              }
                            >
                              <p className={item.splitMode === "equal" ? "font-semibold text-primary" : "font-semibold"}>
                                다 같이 똑같이
                              </p>
                              <p className="mt-1 text-xs text-muted-foreground">선택한 사람들이 같은 금액으로 부담해요.</p>
                            </button>
                            <button
                              type="button"
                              onClick={() => updateItemSplitMode(item.id, "quantity")}
                              className={
                                item.splitMode === "quantity"
                                  ? "rounded-xl border border-primary bg-primary/10 p-3 text-left"
                                  : "rounded-xl border border-border bg-card p-3 text-left hover:bg-muted/50"
                              }
                            >
                              <p className={item.splitMode === "quantity" ? "font-semibold text-primary" : "font-semibold"}>
                                먹은 양이 달라요
                              </p>
                              <p className="mt-1 text-xs text-muted-foreground">몇 병, 몇 개, 몇 인분을 누가 먹었는지 입력해요.</p>
                            </button>
                          </div>
                        </div>

                        {item.splitMode === "equal" ? (
                          <div className="space-y-2">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-sm font-medium">{getCategoryHelper(item.category)}</p>
                              <div className="flex gap-2">
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => selectAllItemParticipants(item.id)}
                                >
                                  전체 선택
                                </Button>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => clearAllItemParticipants(item.id)}
                                >
                                  전체 해제
                                </Button>
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              {people.map((person, index) => {
                                const checked = item.participantIds.includes(person.id);
                                return (
                                  <label
                                    key={person.id}
                                    className={
                                      checked
                                        ? "flex items-center gap-2 p-2 rounded-lg border border-primary bg-primary/10 cursor-pointer"
                                        : "flex items-center gap-2 p-2 rounded-lg border border-border cursor-pointer hover:bg-muted/50"
                                    }
                                  >
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      onChange={(event) => toggleItemParticipant(item.id, person.id, event.target.checked)}
                                      className="h-4 w-4 rounded border-border"
                                    />
                                    <span className="text-sm font-medium">{displayName(person, index)}</span>
                                  </label>
                                );
                              })}
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-3">
                              <div className="space-y-2">
                                <label className="text-sm text-muted-foreground">총 수량</label>
                                <div className="relative">
                                  <Input
                                    type="text"
                                    inputMode="decimal"
                                    value={item.totalQuantity || ""}
                                    onChange={(event) =>
                                      updateItem(item.id, (current) => ({
                                        ...current,
                                        totalQuantity: parseQuantityInput(event.target.value),
                                      }))
                                    }
                                    placeholder="예: 5"
                                    className="h-12 pl-16 text-right"
                                  />
                                  {item.totalQuantity !== 1 && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        updateItem(item.id, (current) => ({
                                          ...current,
                                          totalQuantity: 1,
                                          portions: current.portions.map((portion, index) =>
                                            index === 0 ? { ...portion, quantity: 1 } : portion
                                          ),
                                        }))
                                      }
                                      className="absolute left-3 top-1/2 -translate-y-1/2 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
                                    >
                                      초기화
                                    </button>
                                  )}
                                </div>
                              </div>
                              <div className="space-y-2">
                                <label className="text-sm text-muted-foreground">단위</label>
                                <div className="relative">
                                  <Input
                                    value={item.quantityUnit}
                                    onChange={(event) =>
                                      updateItem(item.id, (current) => ({
                                        ...current,
                                        quantityUnit: event.target.value,
                                      }))
                                    }
                                    placeholder={getDefaultQuantityUnit(item.category)}
                                    className="h-12 pl-20"
                                  />
                                  <button
                                    type="button"
                                    onClick={() =>
                                      updateItem(item.id, (current) => ({
                                        ...current,
                                        quantityUnit: getDefaultQuantityUnit(current.category),
                                      }))
                                    }
                                    className="absolute left-3 top-1/2 -translate-y-1/2 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
                                  >
                                    초기화
                                  </button>
                                </div>
                              </div>
                            </div>

                            <div className="space-y-2">
                              <div className="flex items-center justify-between gap-2">
                                <div>
                                  <p className="text-sm font-medium">누가 얼마나 먹었나요?</p>
                                  <p className="text-xs text-muted-foreground">
                                    예: 2병은 철수, 1병은 영희, 1병은 세 명이 나눠 마심
                                  </p>
                                </div>
                                <Button type="button" variant="outline" size="sm" onClick={() => addItemPortion(item.id)}>
                                  <Plus className="w-4 h-4 mr-1" />
                                  먹은 양 추가
                                </Button>
                              </div>

                              <div className="space-y-3">
                                {item.portions.map((portion, portionIndex) => {
                                  const distributedQuantity = item.portions.reduce(
                                    (sum, current) => sum + (Number(current.quantity) || 0),
                                    0
                                  );
                                  const remainingQuantity = item.totalQuantity - distributedQuantity;

                                  return (
                                    <div key={portion.id} className="p-3 rounded-xl border border-border bg-muted/20 space-y-3">
                                      <div className="flex items-center justify-between gap-2">
                                        <p className="text-sm font-semibold">먹은 양 {portionIndex + 1}</p>
                                        {item.portions.length > 1 && (
                                          <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => removeItemPortion(item.id, portion.id)}
                                            className="text-muted-foreground"
                                          >
                                            <Trash2 className="w-4 h-4 mr-1" />
                                            삭제
                                          </Button>
                                        )}
                                      </div>

                                      <div className="grid grid-cols-[1fr_auto] gap-2 items-center">
                                        <div className="relative">
                                          <Input
                                            type="text"
                                            inputMode="decimal"
                                            value={portion.quantity || ""}
                                            onChange={(event) =>
                                              updateItemPortion(item.id, portion.id, (current) => ({
                                                ...current,
                                                quantity: parseQuantityInput(event.target.value),
                                              }))
                                            }
                                            placeholder="예: 1"
                                            className="h-11 pl-16 text-right"
                                          />
                                          {portion.quantity !== 1 && (
                                            <button
                                              type="button"
                                              onClick={() =>
                                                updateItemPortion(item.id, portion.id, (current) => ({
                                                  ...current,
                                                  quantity: 1,
                                                }))
                                              }
                                              className="absolute left-3 top-1/2 -translate-y-1/2 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
                                            >
                                              초기화
                                            </button>
                                          )}
                                        </div>
                                        <span className="text-sm text-muted-foreground min-w-10">
                                          {item.quantityUnit || "단위"}
                                        </span>
                                      </div>

                                      <div className="flex items-center justify-between gap-2">
                                        <p className="text-sm font-medium">누가 이 양을 먹었나요?</p>
                                        <div className="flex gap-2">
                                          <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            onClick={() => selectAllPortionParticipants(item.id, portion.id)}
                                          >
                                            전체 선택
                                          </Button>
                                          <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            onClick={() => clearAllPortionParticipants(item.id, portion.id)}
                                          >
                                            전체 해제
                                          </Button>
                                        </div>
                                      </div>

                                      <div className="grid grid-cols-2 gap-2">
                                        {people.map((person, index) => {
                                          const checked = portion.participantIds.includes(person.id);
                                          return (
                                            <label
                                              key={person.id}
                                              className={
                                                checked
                                                  ? "flex items-center gap-2 p-2 rounded-lg border border-primary bg-primary/10 cursor-pointer"
                                                  : "flex items-center gap-2 p-2 rounded-lg border border-border cursor-pointer hover:bg-muted/50"
                                              }
                                            >
                                              <input
                                                type="checkbox"
                                                checked={checked}
                                                onChange={(event) =>
                                                  toggleItemPortionParticipant(
                                                    item.id,
                                                    portion.id,
                                                    person.id,
                                                    event.target.checked
                                                  )
                                                }
                                                className="h-4 w-4 rounded border-border"
                                              />
                                              <span className="text-sm font-medium">{displayName(person, index)}</span>
                                            </label>
                                          );
                                        })}
                                      </div>

                                      {portionIndex === item.portions.length - 1 && (
                                        <p className="text-xs text-muted-foreground">
                                          배분 합계: {distributedQuantity.toLocaleString()} {item.quantityUnit || "단위"} / 남은 수량: {remainingQuantity.toLocaleString()} {item.quantityUnit || "단위"}
                                        </p>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {renderValidationErrors(detailValidationErrors.filter((error) => !error.includes("계산이 맞지 않아요")))}

                <div className="sticky bottom-4 z-20 flex gap-3 p-3 bg-background/90 backdrop-blur border border-border rounded-2xl shadow-lg">
                  <Button variant="outline" onClick={() => setDetailStep("items")} className="flex-1 h-12">
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    이전
                  </Button>
                  <Button onClick={() => setDetailStep("review")} disabled={!canCalculateDetail} className="flex-1 h-12">
                    다음: 계산 확인
                  </Button>
                </div>
              </div>
            )}

            {detailStep === "review" && (
              <div className="space-y-6">
                <section className="space-y-2">
                  <h3 className="text-lg font-bold">계산 확인</h3>
                  <p className="text-sm text-muted-foreground">
                    총액과 항목 합계가 맞고, 각 항목의 나누는 방식이 모두 입력되었는지 확인하세요.
                  </p>
                </section>

                <section className="p-4 bg-muted/50 rounded-xl space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">대표 결제자</span>
                    <span className="font-medium">{mainPayerName}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">총 결제금액</span>
                    <span className="font-medium">{detailTotalAmount.toLocaleString()}원</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">항목 합계</span>
                    <span className="font-medium">{detailItemTotalAmount.toLocaleString()}원</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">할인 금액</span>
                    <span className="font-medium">-{detailDiscountValue.toLocaleString()}원</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">지원 금액 합계</span>
                    <span className="font-medium">-{detailDirectSupportTotal.toLocaleString()}원</span>
                  </div>
                  <div className="flex justify-between text-sm pt-2 border-t border-border">
                    <span className="text-muted-foreground">실제로 나눌 금액</span>
                    <span className="font-semibold">{detailSettlementAmount.toLocaleString()}원</span>
                  </div>
                  <p className="text-xs text-muted-foreground pt-2">
                    항목 합계는 할인 후 실제로 나눌 금액과 맞아야 하고, 지원 금액은 결과에서 직접 부담으로 분리됩니다.
                  </p>
                </section>

                <section className="space-y-3">
                  <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                    항목 요약
                  </h3>
                  <div className="space-y-2">
                    {items.map((item, index) => (
                      <div key={item.id} className="p-3 rounded-xl border border-border bg-card">
                        <div className="flex justify-between gap-3">
                          <div>
                            <p className="font-medium">{item.name.trim() || `항목 ${index + 1}`}</p>
                            <p className="text-xs text-muted-foreground">
                              {getCategoryLabel(item.category)} · {item.directCoveredAmount >= item.amount ? "직접 부담" : item.splitMode === "equal" ? "다 같이 똑같이" : "먹은 양이 달라요"}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="font-semibold">{item.amount.toLocaleString()}원</p>
                            {item.directCoveredAmount > 0 && (
                              <p className="text-xs text-muted-foreground">
                                지원 {Math.min(item.directCoveredAmount, item.amount).toLocaleString()}원
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>

                {renderValidationErrors(detailValidationErrors)}

                <div className="sticky bottom-4 z-20 flex gap-3 p-3 bg-background/90 backdrop-blur border border-border rounded-2xl shadow-lg">
                  <Button variant="outline" onClick={() => setDetailStep("split")} className="flex-1 h-12">
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    이전
                  </Button>
                  <Button onClick={handleCalculateDetail} disabled={!canCalculateDetail} className="flex-1 h-12">
                    정산하기
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
        {step === "result" && result && (
          <ResultView
            result={result}
            onEditPeople={() => setStep("people")}
            onEditAmount={editCurrentInput}
            onReset={handleReset}
          />
        )}
      </main>
    </div>
  );
}
