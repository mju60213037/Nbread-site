import type {
  CalculationResult,
  ItemCalculationDetail,
  Person,
  PersonBalance,
  QuickSupportDetail,
  SplitItem,
  Transfer,
} from "./types";

interface QuickSupportInput {
  id: string;
  payerId: string;
  amount: number;
}

interface CalculateQuickDutchPayParams {
  totalAmount: number;
  discountAmount: number;
  people: Person[];
  mainPayerId: string;
  supportContributions?: QuickSupportInput[];
  coveredPayerId?: string;
  coveredAmount?: number;
  splitParticipantIds: string[];
}

interface CalculateDetailDutchPayParams {
  totalAmount: number;
  discountAmount: number;
  people: Person[];
  mainPayerId: string;
  items: SplitItem[];
}

function safeMoney(value: number): number {
  return Math.max(0, Math.floor(Number(value) || 0));
}

function safeQuantity(value: number): number {
  return Math.max(0, Number(value) || 0);
}

function getDisplayName(person: Person, index: number): string {
  return person.name.trim() || `참여자 ${index + 1}`;
}

function getPersonName(people: Person[], personId: string): string {
  const personIndex = people.findIndex((person) => person.id === personId);
  return personIndex >= 0 ? getDisplayName(people[personIndex], personIndex) : "참여자";
}

function getMainPayer(people: Person[], mainPayerId: string) {
  const mainPayerIndex = people.findIndex((person) => person.id === mainPayerId);
  const mainPayer = people[mainPayerIndex] ?? people[0];
  const safeMainPayerId = mainPayer?.id ?? mainPayerId;
  const mainPayerName = mainPayer
    ? getDisplayName(mainPayer, Math.max(0, mainPayerIndex))
    : "대표 결제자";

  return { mainPayerIndex, mainPayer, mainPayerId: safeMainPayerId, mainPayerName };
}

function makeTransfers({
  people,
  mainPayerId,
  mainPayerName,
  coveredAmountById,
  burdenById,
}: {
  people: Person[];
  mainPayerId: string;
  mainPayerName: string;
  coveredAmountById: Map<string, number>;
  burdenById: Map<string, number>;
}): Transfer[] {
  return people
    .map((person, index) => ({ person, index }))
    .filter(({ person }) => person.id !== mainPayerId)
    .map(({ person, index }) => ({
      person,
      index,
      amount: safeMoney(coveredAmountById.get(person.id) ?? 0) + safeMoney(burdenById.get(person.id) ?? 0),
    }))
    .filter(({ amount }) => amount > 0)
    .map(({ person, index, amount }) => ({
      fromId: person.id,
      fromName: getDisplayName(person, index),
      toId: mainPayerId,
      toName: mainPayerName,
      amount,
    }));
}

function makeBalances({
  people,
  mainPayerId,
  splitParticipantIds,
  coveredAmountById,
  burdenById,
  transfers,
}: {
  people: Person[];
  mainPayerId: string;
  splitParticipantIds: string[];
  coveredAmountById: Map<string, number>;
  burdenById: Map<string, number>;
  transfers: Transfer[];
}): PersonBalance[] {
  const splitSet = new Set(splitParticipantIds);
  const receiveByMainPayer = transfers.reduce((sum, transfer) => sum + transfer.amount, 0);

  return people.map((person, index) => {
    const isMainPayer = person.id === mainPayerId;
    const coveredAmount = safeMoney(coveredAmountById.get(person.id) ?? 0);
    const splitShareAmount = safeMoney(burdenById.get(person.id) ?? 0);
    const receiveAmount = isMainPayer ? receiveByMainPayer : 0;
    const sendAmount = isMainPayer ? 0 : coveredAmount + splitShareAmount;

    return {
      id: person.id,
      name: getDisplayName(person, index),
      isMainPayer,
      isSplitParticipant: splitSet.has(person.id),
      coveredAmount,
      splitShareAmount,
      finalBurdenAmount: coveredAmount + splitShareAmount,
      receiveAmount,
      sendAmount,
    };
  });
}

function addSplitAmount({
  burdenById,
  participantIds,
  amount,
}: {
  burdenById: Map<string, number>;
  participantIds: string[];
  amount: number;
}) {
  const safeAmount = safeMoney(amount);
  const participantCount = participantIds.length;
  if (safeAmount <= 0 || participantCount <= 0) return { baseShareAmount: 0, remainder: 0 };

  const baseShareAmount = Math.floor(safeAmount / participantCount);
  const remainder = safeAmount % participantCount;

  participantIds.forEach((personId, index) => {
    const shareAmount = baseShareAmount + (index < remainder ? 1 : 0);
    burdenById.set(personId, (burdenById.get(personId) ?? 0) + shareAmount);
  });

  return { baseShareAmount, remainder };
}

export function calculateDutchPay({
  totalAmount,
  discountAmount,
  people,
  mainPayerId,
  supportContributions,
  coveredPayerId,
  coveredAmount,
  splitParticipantIds,
}: CalculateQuickDutchPayParams): CalculationResult {
  const safeTotalAmount = safeMoney(totalAmount);
  const safeDiscountAmount = Math.min(safeMoney(discountAmount), safeTotalAmount);
  const settlementAmount = safeTotalAmount - safeDiscountAmount;
  const mainPayer = getMainPayer(people, mainPayerId);
  const validPersonIds = new Set(people.map((person) => person.id));

  const rawSupportContributions = supportContributions && supportContributions.length > 0
    ? supportContributions
    : coveredAmount && coveredAmount > 0
      ? [{ id: "support-legacy", payerId: coveredPayerId || mainPayer.mainPayerId, amount: coveredAmount }]
      : [];

  const coveredAmountById = new Map<string, number>();
  const supportDetails: QuickSupportDetail[] = [];
  let availableSupportAmount = settlementAmount;

  rawSupportContributions.forEach((support) => {
    const payerId = validPersonIds.has(support.payerId) ? support.payerId : "";
    const safeAmount = Math.min(safeMoney(support.amount), availableSupportAmount);
    if (!payerId || safeAmount <= 0) return;

    coveredAmountById.set(payerId, (coveredAmountById.get(payerId) ?? 0) + safeAmount);
    supportDetails.push({
      id: support.id,
      payerId,
      payerName: getPersonName(people, payerId),
      amount: safeAmount,
    });
    availableSupportAmount -= safeAmount;
  });

  const safeCoveredAmount = Array.from(coveredAmountById.values()).reduce((sum, amount) => sum + amount, 0);
  const remainingAmount = Math.max(0, settlementAmount - safeCoveredAmount);

  const splitSet = new Set(splitParticipantIds);
  const splitParticipants = people.filter((person) => splitSet.has(person.id));
  const splitParticipantCount = splitParticipants.length;
  const participantIds = splitParticipants.map((person) => person.id);

  const burdenById = new Map<string, number>();
  const { baseShareAmount, remainder } = addSplitAmount({
    burdenById,
    participantIds,
    amount: remainingAmount,
  });

  const transfers = makeTransfers({
    people,
    mainPayerId: mainPayer.mainPayerId,
    mainPayerName: mainPayer.mainPayerName,
    coveredAmountById,
    burdenById,
  });

  const balances = makeBalances({
    people,
    mainPayerId: mainPayer.mainPayerId,
    splitParticipantIds,
    coveredAmountById,
    burdenById,
    transfers,
  });

  const firstSupport = supportDetails[0];

  return {
    mode: "quick",
    totalAmount: safeTotalAmount,
    discountAmount: safeDiscountAmount,
    settlementAmount,
    mainPayerId: mainPayer.mainPayerId,
    mainPayerName: mainPayer.mainPayerName,
    coveredPayerId: firstSupport?.payerId,
    coveredPayerName: firstSupport?.payerName,
    supportDetails,
    coveredAmount: safeCoveredAmount,
    remainingAmount,
    splitParticipantCount,
    baseSplitAmount: baseShareAmount,
    remainder,
    people: balances,
    transfers,
  };
}

function distributeDiscount(items: SplitItem[], discountAmount: number): Map<string, number> {
  const safeItems = items.map((item) => ({ ...item, amount: safeMoney(item.amount) }));
  const totalAmount = safeItems.reduce((sum, item) => sum + item.amount, 0);
  const safeDiscountAmount = Math.min(safeMoney(discountAmount), totalAmount);
  const discountById = new Map<string, number>();

  if (totalAmount <= 0 || safeDiscountAmount <= 0) {
    safeItems.forEach((item) => discountById.set(item.id, 0));
    return discountById;
  }

  let usedDiscount = 0;
  const fractions = safeItems.map((item) => {
    const exact = (item.amount * safeDiscountAmount) / totalAmount;
    const floorValue = Math.floor(exact);
    discountById.set(item.id, floorValue);
    usedDiscount += floorValue;
    return { id: item.id, fraction: exact - floorValue };
  });

  let rest = safeDiscountAmount - usedDiscount;
  fractions
    .sort((a, b) => b.fraction - a.fraction)
    .forEach(({ id }) => {
      if (rest <= 0) return;
      discountById.set(id, (discountById.get(id) ?? 0) + 1);
      rest -= 1;
    });

  return discountById;
}

function normalizeItem(item: SplitItem, people: Person[]): SplitItem {
  const validPersonIds = new Set(people.map((person) => person.id));
  const participantIds = item.participantIds.filter((participantId) =>
    validPersonIds.has(participantId)
  );
  const portions = item.portions.map((portion) => ({
    ...portion,
    quantity: safeQuantity(portion.quantity),
    participantIds: portion.participantIds.filter((participantId) =>
      validPersonIds.has(participantId)
    ),
  }));

  return {
    ...item,
    amount: safeMoney(item.amount),
    directPayerId: validPersonIds.has(item.directPayerId) ? item.directPayerId : "",
    directCoveredAmount: safeMoney(item.directCoveredAmount),
    participantIds,
    totalQuantity: safeQuantity(item.totalQuantity),
    quantityUnit: item.quantityUnit.trim() || "단위",
    portions,
  };
}

export function calculateDetailDutchPay({
  totalAmount,
  discountAmount,
  people,
  mainPayerId,
  items,
}: CalculateDetailDutchPayParams): CalculationResult {
  const safeItems = items.map((item) => normalizeItem(item, people));
  const itemTotalAmount = safeItems.reduce((sum, item) => sum + item.amount, 0);
  const safeTotalAmount = safeMoney(totalAmount);
  const safeDiscountAmount = Math.min(safeMoney(discountAmount), safeTotalAmount);
  const settlementAmount = safeTotalAmount - safeDiscountAmount;
  const mainPayer = getMainPayer(people, mainPayerId);
  // 상세 계산에서는 항목 금액을 이미 쿠폰/할인 적용 후 실제로 나눌 금액으로 입력합니다.
  // 따라서 항목별 금액에서 할인을 다시 차감하지 않습니다.
  const discountById = new Map<string, number>(safeItems.map((item) => [item.id, 0]));

  const burdenById = new Map<string, number>();
  const coveredAmountById = new Map<string, number>();
  const itemDetails: ItemCalculationDetail[] = [];
  let totalRemainder = 0;

  safeItems.forEach((item) => {
    const itemDiscountAmount = discountById.get(item.id) ?? 0;
    const itemSettlementAmount = Math.max(0, item.amount - itemDiscountAmount);
    const directCoveredAmount = item.directPayerId
      ? Math.min(safeMoney(item.directCoveredAmount), itemSettlementAmount)
      : 0;
    const splitTargetAmount = Math.max(0, itemSettlementAmount - directCoveredAmount);

    if (item.directPayerId && directCoveredAmount > 0) {
      coveredAmountById.set(
        item.directPayerId,
        (coveredAmountById.get(item.directPayerId) ?? 0) + directCoveredAmount
      );
    }

    if (splitTargetAmount <= 0) {
      itemDetails.push({
        id: item.id,
        name: item.name.trim() || "항목",
        category: item.category,
        splitMode: item.splitMode,
        originalAmount: item.amount,
        discountAmount: itemDiscountAmount,
        settlementAmount: itemSettlementAmount,
        directPayerId: item.directPayerId || undefined,
        directPayerName: item.directPayerId ? getPersonName(people, item.directPayerId) : undefined,
        directCoveredAmount,
        splitTargetAmount,
        participantCount: item.directPayerId ? 1 : 0,
        baseShareAmount: 0,
        remainder: 0,
        participantNames: item.directPayerId ? [getPersonName(people, item.directPayerId)] : [],
        totalQuantity: item.splitMode === "quantity" ? item.totalQuantity : undefined,
        quantityUnit: item.splitMode === "quantity" ? item.quantityUnit : undefined,
        portions: item.splitMode === "quantity" ? [] : undefined,
      });
      return;
    }

    if (item.splitMode === "quantity") {
      const totalQuantity = safeQuantity(item.totalQuantity);
      const unitAmount = totalQuantity > 0 ? splitTargetAmount / totalQuantity : 0;
      const portions = item.portions.map((portion, index) => {
        const isLast = index === item.portions.length - 1;
        const usedBefore = item.portions
          .slice(0, index)
          .reduce((sum, prev) => sum + safeMoney(unitAmount * safeQuantity(prev.quantity)), 0);
        const rawPortionAmount = unitAmount * safeQuantity(portion.quantity);
        const portionSettlementAmount = isLast
          ? Math.max(0, splitTargetAmount - usedBefore)
          : safeMoney(rawPortionAmount);

        const { baseShareAmount, remainder } = addSplitAmount({
          burdenById,
          participantIds: portion.participantIds,
          amount: portionSettlementAmount,
        });
        totalRemainder += remainder;

        return {
          id: portion.id,
          quantity: safeQuantity(portion.quantity),
          participantCount: portion.participantIds.length,
          participantNames: portion.participantIds.map((personId) => getPersonName(people, personId)),
          settlementAmount: portionSettlementAmount,
          baseShareAmount,
          remainder,
        };
      });

      itemDetails.push({
        id: item.id,
        name: item.name.trim() || "항목",
        category: item.category,
        splitMode: "quantity",
        originalAmount: item.amount,
        discountAmount: itemDiscountAmount,
        settlementAmount: itemSettlementAmount,
        directPayerId: item.directPayerId || undefined,
        directPayerName: item.directPayerId ? getPersonName(people, item.directPayerId) : undefined,
        directCoveredAmount,
        splitTargetAmount,
        participantCount: Array.from(new Set(item.portions.flatMap((portion) => portion.participantIds))).length,
        baseShareAmount: 0,
        remainder: portions.reduce((sum, portion) => sum + portion.remainder, 0),
        participantNames: Array.from(new Set(item.portions.flatMap((portion) => portion.participantIds))).map((personId) =>
          getPersonName(people, personId)
        ),
        totalQuantity,
        quantityUnit: item.quantityUnit,
        portions,
      });
      return;
    }

    const participantCount = item.participantIds.length;
    const { baseShareAmount, remainder } = addSplitAmount({
      burdenById,
      participantIds: item.participantIds,
      amount: splitTargetAmount,
    });
    totalRemainder += remainder;

    itemDetails.push({
      id: item.id,
      name: item.name.trim() || "항목",
      category: item.category,
      splitMode: "equal",
      originalAmount: item.amount,
      discountAmount: itemDiscountAmount,
      settlementAmount: itemSettlementAmount,
      directPayerId: item.directPayerId || undefined,
      directPayerName: item.directPayerId ? getPersonName(people, item.directPayerId) : undefined,
      directCoveredAmount,
      splitTargetAmount,
      participantCount,
      baseShareAmount,
      remainder,
      participantNames: item.participantIds.map((personId) => getPersonName(people, personId)),
    });
  });

  const transfers = makeTransfers({
    people,
    mainPayerId: mainPayer.mainPayerId,
    mainPayerName: mainPayer.mainPayerName,
    coveredAmountById,
    burdenById,
  });

  const burdenParticipantIds = people
    .filter((person) => (burdenById.get(person.id) ?? 0) > 0 || (coveredAmountById.get(person.id) ?? 0) > 0)
    .map((person) => person.id);
  const balances = makeBalances({
    people,
    mainPayerId: mainPayer.mainPayerId,
    splitParticipantIds: burdenParticipantIds,
    coveredAmountById,
    burdenById,
    transfers,
  });

  return {
    mode: "detail",
    totalAmount: safeTotalAmount || itemTotalAmount,
    discountAmount: safeDiscountAmount,
    settlementAmount,
    mainPayerId: mainPayer.mainPayerId,
    mainPayerName: mainPayer.mainPayerName,
    coveredAmount: 0,
    remainingAmount: settlementAmount,
    splitParticipantCount: burdenParticipantIds.length,
    baseSplitAmount: 0,
    remainder: totalRemainder,
    people: balances,
    transfers,
    itemDetails,
  };
}
