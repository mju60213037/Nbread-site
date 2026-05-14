"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
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
type QuickSupportInput = { id: string; payerId: string; amount: number };

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
  { category: "karaoke", label: "노래방", defaultName: "노래방", helper: "누가 함께 나누나요?" },
  { category: "etc", label: "기타", defaultName: "기타", helper: "누가 함께 부담하나요?" },
];

type ReceiptItemCandidate = {
  id: string;
  name: string;
  amount: number;
  category: SplitItemCategory;
};

type ReceiptPaymentInfo = {
  prepaidAmount: number;
  unpaidAmount: number;
  splitTotalAmount: number;
};

type ReceiptOcrWord = {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

type ReceiptOcrRow = {
  text: string;
  words: ReceiptOcrWord[];
  y: number;
  height: number;
};

type ReceiptParseResult = {
  totalAmount: number;
  explicitTotalAmount: number;
  itemTotalAmount: number;
  items: ReceiptItemCandidate[];
  warnings: string[];
  notices: string[];
  paymentInfo: ReceiptPaymentInfo;
};

type ReceiptApplyMode = "quick" | "detail";

function displayName(person: Person, index: number): string {
  return person.name.trim() || `참여자 ${index + 1}`;
}

function parseMoneyInput(value: string): number {
  const onlyDigits = value.replace(/[^0-9]/g, "");
  if (onlyDigits === "") return 0;

  return Math.min(MAX_MONEY, Number(onlyDigits));
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

function createId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function getCategoryLabel(category: SplitItemCategory): string {
  return itemCategoryOptions.find((option) => option.category === category)?.label ?? "기타";
}

function getCategoryHelper(category: SplitItemCategory): string {
  return itemCategoryOptions.find((option) => option.category === category)?.helper ?? "누가 함께 부담하나요?";
}

type ItemWording = {
  quantityModeLabel: string;
  totalQuantityLabel: string;
  totalQuantityPlaceholder: string;
  participantLabel: string;
  portionGroupTitle: string;
  portionQuantityLabel: string;
  portionQuantityPlaceholder: string;
  portionParticipantLabel: string;
  addPortionLabel: string;
  portionExample: string;
};

function getItemWording(category: SplitItemCategory): ItemWording {
  switch (category) {
    case "food":
    case "dessert":
      return {
        quantityModeLabel: "먹은 양이 달라요",
        totalQuantityLabel: "총 몇 개/몇 인분인가요?",
        totalQuantityPlaceholder: "예: 5",
        participantLabel: getCategoryHelper(category),
        portionGroupTitle: "누가 얼마나 먹었나요?",
        portionQuantityLabel: "얼마나 먹었나요?",
        portionQuantityPlaceholder: "예: 1",
        portionParticipantLabel: "누가 얼마나 먹었나요?",
        addPortionLabel: "먹은 양 추가",
        portionExample: "예: 2인분은 철수, 1인분은 영희, 1인분은 세 명이 함께 먹음",
      };
    case "alcohol":
    case "drink":
      return {
        quantityModeLabel: "마신 양이 달라요",
        totalQuantityLabel: "총 몇 병/몇 잔인가요?",
        totalQuantityPlaceholder: "예: 4",
        participantLabel: getCategoryHelper(category),
        portionGroupTitle: "누가 얼마나 마셨나요?",
        portionQuantityLabel: "얼마나 마셨나요?",
        portionQuantityPlaceholder: "예: 1",
        portionParticipantLabel: "누가 얼마나 마셨나요?",
        addPortionLabel: "마신 양 추가",
        portionExample: "예: 2병은 철수, 1병은 영희, 1병은 세 명이 나눠 마심",
      };
    case "taxi":
      return {
        quantityModeLabel: "이용 구간이 달라요",
        totalQuantityLabel: "전체 이용량은 얼마인가요?",
        totalQuantityPlaceholder: "예: 3",
        participantLabel: getCategoryHelper(category),
        portionGroupTitle: "누가 얼마나 이용했나요?",
        portionQuantityLabel: "이용량",
        portionQuantityPlaceholder: "예: 1",
        portionParticipantLabel: "누가 얼마나 이용했나요?",
        addPortionLabel: "이용량 추가",
        portionExample: "예: 1구간은 철수와 영희, 2구간은 철수만 이용함",
      };
    case "stay":
      return {
        quantityModeLabel: "이용량이 달라요",
        totalQuantityLabel: "전체 이용량은 얼마인가요?",
        totalQuantityPlaceholder: "예: 2",
        participantLabel: getCategoryHelper(category),
        portionGroupTitle: "누가 얼마나 이용했나요?",
        portionQuantityLabel: "이용량",
        portionQuantityPlaceholder: "예: 1",
        portionParticipantLabel: "누가 얼마나 이용했나요?",
        addPortionLabel: "이용량 추가",
        portionExample: "예: 1박은 전원, 추가 1박은 철수와 영희만 이용함",
      };
    case "karaoke":
      return {
        quantityModeLabel: "이용 시간이 달라요",
        totalQuantityLabel: "전체 몇 시간인가요?",
        totalQuantityPlaceholder: "예: 2",
        participantLabel: "누가 함께 나누나요?",
        portionGroupTitle: "누가 얼마나 이용했나요?",
        portionQuantityLabel: "얼마나 이용했나요?",
        portionQuantityPlaceholder: "예: 1",
        portionParticipantLabel: "누가 얼마나 이용했나요?",
        addPortionLabel: "이용량 추가",
        portionExample: "예: 1시간은 전원, 추가 1시간은 철수와 영희만 이용함",
      };
    default:
      return {
        quantityModeLabel: "사용량이 달라요",
        totalQuantityLabel: "전체 수량은 얼마인가요?",
        totalQuantityPlaceholder: "예: 5",
        participantLabel: getCategoryHelper(category),
        portionGroupTitle: "누가 얼마나 사용했나요?",
        portionQuantityLabel: "사용량",
        portionQuantityPlaceholder: "예: 1",
        portionParticipantLabel: "누가 얼마나 사용했나요?",
        addPortionLabel: "사용량 추가",
        portionExample: "예: 2개는 철수, 1개는 영희, 1개는 전원이 함께 사용함",
      };
  }
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
    case "karaoke":
      return "예: 노래방비, 코인노래방";
    default:
      return "예: 직접 입력";
  }
}

function getDefaultQuantityUnit(category: SplitItemCategory): string {
  if (category === "alcohol") return "병";
  if (category === "drink") return "잔";
  if (category === "stay") return "박";
  if (category === "karaoke") return "시간";
  return "개";
}

function normalizeOcrLine(line: string): string {
  return line.replace(/ /g, " ").replace(/[|]/g, " ").replace(/\s+/g, " ").trim();
}

function parseReceiptMoney(value: string): number {
  const token = value.trim();
  const thousandLike = token.match(/[0-9]{1,3}(?:[,.][0-9]{3})+/)?.[0] ?? token;
  const onlyDigits = thousandLike.replace(/[^0-9]/g, "");
  if (!onlyDigits) return 0;

  const amount = Number(onlyDigits);
  if (!Number.isFinite(amount)) return 0;

  // 영수증에는 500원짜리 소스/공기밥/봉투 같은 항목도 있을 수 있으므로
  // 1,000원 하한선은 두지 않습니다. 대신 수량/번호로 보이는 매우 작은 값과
  // 승인번호처럼 보이는 과도한 큰 값만 보수적으로 제외합니다.
  if (amount < 50 || amount > 10_000_000) return 0;

  return amount;
}

type ReceiptMoneyMatch = {
  raw: string;
  amount: number;
  index: number;
};

function extractReceiptMoneyMatches(line: string): ReceiptMoneyMatch[] {
  const matches = Array.from(
    line.matchAll(/[0-9]{1,3}(?:[,.][0-9]{3})+|[0-9]{2,7}/g)
  );

  return matches
    .map((match) => ({
      raw: match[0],
      amount: parseReceiptMoney(match[0]),
      index: match.index ?? 0,
    }))
    .filter((match) => match.amount > 0);
}

function isReceiptMetaLine(line: string): boolean {
  return /주문번호|주문 번호|사업자|전화|주소|대표자|대표번호|일시|시간|테이블명|테이블 명|테이블|CASHIER|관리자|카드번호|카드 번호|카드종류|카드 종류|개월|일시불|승인|인번호|가맹점|부가세|공급가|과세|면세|합계|총액|총 금액|결제|미결제|선결제|받을금액|청구금액|판매금액|신용승인정보/i.test(line);
}

function isReceiptHeaderLine(line: string): boolean {
  return /품명|상품명|메뉴명|메뉴|단가|수량|금액|계산서|영수증|receipt/i.test(line);
}

function cleanReceiptItemName(value: string): string {
  return value
    .replace(/^\s*[0-9]{1,3}\s*[.)]\s*/, "")
    .replace(/[0-9]{1,3}(?:[,.][0-9]{3})+|[0-9]{4,7}/g, " ")
    .replace(/[0-9]+/g, " ")
    .replace(/[₩원]/g, " ")
    .replace(/[xX*×]/g, " ")
    .replace(/[-_:]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasReceiptItemName(value: string): boolean {
  return /[가-힣A-Za-z]/.test(value) && cleanReceiptItemName(value).length >= 1;
}

function guessReceiptItemCategory(_name: string): SplitItemCategory {
  // OCR 자동 생성 항목은 과한 자동 분류를 하지 않습니다.
  // 내부 타입은 기존 기타(etc)를 사용하고, 화면에서는 자동 항목으로 안내합니다.
  return "etc";
}

function shouldSkipReceiptAmountLine(line: string): boolean {
  if (isReceiptMetaLine(line)) return true;
  if (/^[0-9\s:./-]+$/.test(line)) return true;
  return false;
}

function isReceiptPaymentAreaLine(line: string): boolean {
  return /신용승인정보|카드종류|카드번호|카드 번호|판매금액|승인금액|승인 번호|승인번호|인번호|가맹점|부가세|공급가|과세|면세|CASHIER|관리자|일시불|승인일시/i.test(line);
}

function isReceiptTotalLine(line: string): boolean {
  return /합계\s*금액|합\s*계\s*금\s*액|합계|총\s*금액|총액|받을금액|청구금액|미결제|결제금액|승인금액/i.test(line);
}

function isReceiptItemAreaStartLine(line: string): boolean {
  return /품명|상품명|메뉴명|메뉴|단가|수량|금액/i.test(line);
}

function isReceiptItemAreaStopLine(line: string): boolean {
  return isReceiptTotalLine(line) || isReceiptPaymentAreaLine(line) || /선결제/i.test(line);
}

function isLikelyReceiptItemNameLine(line: string): boolean {
  if (!hasReceiptItemName(line)) return false;
  if (isReceiptMetaLine(line) || isReceiptHeaderLine(line) || isReceiptPaymentAreaLine(line)) return false;

  const cleaned = cleanReceiptItemName(line);
  if (!cleaned) return false;
  if (/^[0-9\s:./-]+$/.test(line)) return false;
  if (/닫기|단가|수량|금액|계산서|영수증|receipt/i.test(cleaned)) return false;

  return /[가-힣A-Za-z]/.test(cleaned);
}

function selectReceiptRowAmount(matches: ReceiptMoneyMatch[]): number {
  if (matches.length === 0) return 0;

  const validMatches = matches.filter((match) => match.amount > 0);
  if (validMatches.length === 0) return 0;
  if (validMatches.length === 1) return validMatches[0].amount;

  const last = validMatches[validMatches.length - 1];
  const previous = validMatches[validMatches.length - 2];
  const lastDigits = last.raw.replace(/[^0-9]/g, "");
  const previousDigits = previous.raw.replace(/[^0-9]/g, "");

  // OCR이 "77,000 1 77,000"을 "77,000 177,000"처럼 붙여 읽는 경우 보정.
  if (previousDigits && lastDigits === `1${previousDigits}`) {
    return previous.amount;
  }

  // 단가와 총액이 같이 있으면 보통 마지막 금액이 총액입니다. 예: 6,500 11 71,500
  const ratio = last.amount / previous.amount;
  if (Number.isFinite(ratio) && ratio >= 2 && ratio <= 30) {
    return last.amount;
  }

  return last.amount;
}



function selectReceiptTotalAmountFromLine(line: string): number {
  const trimmed = line.trim();
  if (!trimmed) return 0;

  const hasTotalKeyword = isReceiptTotalLine(trimmed);
  const hasPaymentStatusKeyword = /선결제|미결제/i.test(trimmed);

  // 날짜, 시간, 주문/승인/카드/가맹점 번호는 총액 후보가 아닙니다.
  if (!hasTotalKeyword && !hasPaymentStatusKeyword) {
    if (/주문번호|주문 번호|테이블명|테이블 명|사업자|전화|주소|카드번호|카드 번호|카드종류|카드 종류|승인번호|승인 번호|인번호|가맹점|승인일시/i.test(trimmed)) {
      return 0;
    }
    if (/\d{4}[-./]\d{1,2}[-./]\d{1,2}/.test(trimmed) || /\d{1,2}:\d{2}/.test(trimmed)) {
      return 0;
    }
  }

  const matches = extractReceiptMoneyMatches(trimmed);
  if (matches.length === 0) return 0;

  const validMatches = matches.filter((match) => {
    const digits = match.raw.replace(/[^0-9]/g, "");
    if (digits.length >= 8) return false;
    return match.amount > 0;
  });

  if (validMatches.length === 0) return 0;
  return selectReceiptRowAmount(validMatches);
}

function getReceiptLineAmountCandidates(line: string): number[] {
  const matches = extractReceiptMoneyMatches(line);
  if (matches.length === 0) return [];

  const selectedAmount = selectReceiptRowAmount(matches);
  if (selectedAmount > 0) return [selectedAmount];

  return matches
    .map((match) => match.amount)
    .filter((amount) => amount > 0);
}

function isLikelyUnitPriceOnlyLine(line: string): boolean {
  const matches = extractReceiptMoneyMatches(line);
  if (matches.length !== 1) return false;

  const amount = matches[0].amount;
  if (amount <= 0) return false;

  // 다음 항목명이 바로 뒤따르는 상황에서는 3,000 / 6,500 같은 단가만 인식된 줄일 가능성이 큽니다.
  // 500원 같은 실제 항목도 있을 수 있으므로 삭제하지 않고, 이름 큐 매칭 단계에서 보수적으로만 사용합니다.
  return amount < 10_000;
}

function findReceiptAmountNearKeyword(lines: string[], keyword: RegExp): number {
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!keyword.test(line)) continue;

    for (let offset = 0; offset <= 5; offset += 1) {
      const targetLine = lines[index + offset];
      if (!targetLine) continue;

      if (offset > 0 && isReceiptPaymentAreaLine(targetLine) && !keyword.test(targetLine)) {
        if (/CASHIER|관리자|일시|^[0-9\s:./()-]+$/i.test(targetLine)) {
          continue;
        }
        break;
      }

      const amount = selectReceiptTotalAmountFromLine(targetLine);
      if (amount > 0) return amount;
    }
  }

  return 0;
}

function getReceiptPaymentInfo(lines: string[]): ReceiptPaymentInfo {
  const prepaidAmount = findReceiptAmountNearKeyword(lines, /선결제/i);
  const unpaidAmount = findReceiptAmountNearKeyword(lines, /미결제/i);
  const splitTotalAmount = prepaidAmount + unpaidAmount;

  return { prepaidAmount, unpaidAmount, splitTotalAmount };
}

function findReceiptExplicitTotalAmount(lines: string[]): number {
  const primaryTotalKeywords = /합계\s*금액|합\s*계\s*금\s*액|총\s*금액|총액|받을금액|청구금액/i;
  const primaryTotal = findReceiptAmountNearKeyword(lines, primaryTotalKeywords);
  if (primaryTotal > 0) return primaryTotal;

  const secondaryTotalKeywords = /결제금액|승인금액/i;
  return findReceiptAmountNearKeyword(lines, secondaryTotalKeywords);
}

function findReceiptTotalAmount(lines: string[], itemTotalAmount: number): {
  totalAmount: number;
  explicitTotalAmount: number;
  paymentInfo: ReceiptPaymentInfo;
} {
  const explicitTotalAmount = findReceiptExplicitTotalAmount(lines);
  const paymentInfo = getReceiptPaymentInfo(lines);

  if (explicitTotalAmount > 0) {
    return { totalAmount: explicitTotalAmount, explicitTotalAmount, paymentInfo };
  }

  if (paymentInfo.splitTotalAmount > 0 && itemTotalAmount > 0 && Math.abs(itemTotalAmount - paymentInfo.splitTotalAmount) <= 1) {
    return { totalAmount: itemTotalAmount, explicitTotalAmount, paymentInfo };
  }

  return { totalAmount: itemTotalAmount, explicitTotalAmount, paymentInfo };
}
function getReceiptItemAreaLines(lines: string[]): string[] {
  let itemAreaStarted = false;
  const itemLines: string[] = [];

  for (const line of lines) {
    if (!itemAreaStarted && isReceiptItemAreaStartLine(line)) {
      itemAreaStarted = true;
      continue;
    }

    if (itemAreaStarted && isReceiptItemAreaStopLine(line)) {
      break;
    }

    if (itemAreaStarted) {
      itemLines.push(line);
    }
  }

  if (itemLines.length > 0) return itemLines;

  const fallbackLines: string[] = [];
  for (const line of lines) {
    if (isReceiptItemAreaStopLine(line) || isReceiptPaymentAreaLine(line)) break;
    if (!isReceiptMetaLine(line)) fallbackLines.push(line);
  }

  return fallbackLines;
}


function getReceiptWordCenterX(word: ReceiptOcrWord): number {
  return word.x + word.width / 2;
}

function getReceiptWordCenterY(word: ReceiptOcrWord): number {
  return word.y + word.height / 2;
}

function groupReceiptWordsIntoRows(words: ReceiptOcrWord[]): ReceiptOcrRow[] {
  const safeWords = words
    .map((word) => ({ ...word, text: normalizeOcrLine(word.text) }))
    .filter((word) => word.text && Number.isFinite(word.x) && Number.isFinite(word.y))
    .sort((a, b) => getReceiptWordCenterY(a) - getReceiptWordCenterY(b));

  if (safeWords.length === 0) return [];

  const sortedHeights = safeWords
    .map((word) => Math.max(1, word.height || 1))
    .sort((a, b) => a - b);
  const medianHeight = sortedHeights[Math.floor(sortedHeights.length / 2)] || 12;
  const tolerance = Math.max(8, medianHeight * 0.75);
  const rows: ReceiptOcrRow[] = [];

  for (const word of safeWords) {
    const centerY = getReceiptWordCenterY(word);
    const target = rows.find((row) => Math.abs(row.y - centerY) <= tolerance);

    if (target) {
      target.words.push(word);
      const centers = target.words.map(getReceiptWordCenterY);
      target.y = centers.reduce((sum, value) => sum + value, 0) / centers.length;
      target.height = Math.max(target.height, word.height || 1);
      continue;
    }

    rows.push({ text: "", words: [word], y: centerY, height: word.height || medianHeight });
  }

  return rows
    .map((row) => {
      const sortedWords = [...row.words].sort((a, b) => a.x - b.x);
      return {
        ...row,
        words: sortedWords,
        text: normalizeOcrLine(sortedWords.map((word) => word.text).join(" ")),
      };
    })
    .sort((a, b) => a.y - b.y);
}

function getReceiptCoordinateItemRows(rows: ReceiptOcrRow[]): ReceiptOcrRow[] {
  const startIndex = rows.findIndex((row) => isReceiptItemAreaStartLine(row.text));
  if (startIndex < 0) return [];

  const itemRows: ReceiptOcrRow[] = [];
  for (let index = startIndex + 1; index < rows.length; index += 1) {
    const row = rows[index];
    if (isReceiptItemAreaStopLine(row.text)) break;
    if (isReceiptPaymentAreaLine(row.text)) break;
    itemRows.push(row);
  }

  return itemRows;
}

function getReceiptAmountColumnX(rows: ReceiptOcrRow[]): number | null {
  const header = rows.find((row) => isReceiptItemAreaStartLine(row.text));
  const amountHeaderWord = header?.words.find((word) => /금액|합계/i.test(word.text));
  if (amountHeaderWord) return getReceiptWordCenterX(amountHeaderWord);

  const moneyXs = rows.flatMap((row) =>
    row.words
      .filter((word) => extractReceiptMoneyMatches(word.text).length > 0)
      .map(getReceiptWordCenterX)
  ).sort((a, b) => a - b);

  if (moneyXs.length === 0) return null;
  return moneyXs[Math.max(0, Math.floor(moneyXs.length * 0.85) - 1)] ?? moneyXs[moneyXs.length - 1];
}

function getReceiptRowMoneyWords(row: ReceiptOcrRow): Array<ReceiptMoneyMatch & { x: number }> {
  const candidates: Array<ReceiptMoneyMatch & { x: number }> = [];

  row.words.forEach((word) => {
    extractReceiptMoneyMatches(word.text).forEach((match) => {
      candidates.push({ ...match, x: getReceiptWordCenterX(word) });
    });
  });

  return candidates.filter((candidate) => candidate.amount > 0);
}

function getReceiptRowName(row: ReceiptOcrRow, amountColumnX: number | null): string {
  const nameWords = row.words.filter((word) => {
    if (extractReceiptMoneyMatches(word.text).length > 0) return false;
    if (amountColumnX !== null && getReceiptWordCenterX(word) > amountColumnX - 20) return false;
    return /[가-힣A-Za-z]/.test(word.text);
  });

  return cleanReceiptItemName(nameWords.map((word) => word.text).join(" "));
}

function selectReceiptCoordinateAmount(
  row: ReceiptOcrRow,
  amountColumnX: number | null,
  unitPrice?: number
): number {
  const moneyWords = getReceiptRowMoneyWords(row);
  if (moneyWords.length === 0) return 0;

  const amountColumnCandidates = amountColumnX === null
    ? moneyWords
    : moneyWords.filter((match) => match.x >= amountColumnX - 35);
  const candidates = amountColumnCandidates.length > 0 ? amountColumnCandidates : moneyWords;
  const selected = candidates.reduce((rightMost, current) => (current.x >= rightMost.x ? current : rightMost), candidates[0]);

  if (unitPrice && unitPrice > 0 && selected.amount > 0) {
    if (selected.amount >= unitPrice && selected.amount % unitPrice === 0) return selected.amount;

    const digits = selected.raw.replace(/[^0-9]/g, "");
    const strippedAmount = Number(digits.slice(1));
    if (
      digits.length >= 5 &&
      Number.isFinite(strippedAmount) &&
      strippedAmount >= unitPrice &&
      strippedAmount % unitPrice === 0 &&
      selected.amount > unitPrice * 10
    ) {
      return strippedAmount;
    }
  }

  return selected.amount;
}

function parseReceiptByCoordinates(words: ReceiptOcrWord[]): ReceiptItemCandidate[] {
  const rows = groupReceiptWordsIntoRows(words);
  const itemRows = getReceiptCoordinateItemRows(rows);
  if (itemRows.length === 0) return [];

  const headerRows = rows.filter((row) => isReceiptItemAreaStartLine(row.text));
  const amountColumnX = getReceiptAmountColumnX([...headerRows, ...itemRows]);
  const directItems: ReceiptItemCandidate[] = [];
  const duplicateItemCounts = new Map<string, number>();
  const pendingItems: Array<{ name: string; unitPrice?: number; age: number }> = [];

  const addCandidateItem = (name: string, amount: number) => {
    const safeName = cleanReceiptItemName(name);
    if (!safeName || amount <= 0) return;

    const duplicateKey = `${safeName}-${amount}`;
    const duplicateCount = duplicateItemCounts.get(duplicateKey) ?? 0;
    duplicateItemCounts.set(duplicateKey, duplicateCount + 1);

    const displayName = duplicateCount === 0
      ? safeName
      : `${safeName}(중복${duplicateCount > 1 ? ` ${duplicateCount + 1}` : ""})`;

    directItems.push({
      id: createId("receipt-item"),
      name: displayName,
      amount,
      category: guessReceiptItemCategory(displayName),
    });
  };

  const pushPending = (name: string) => {
    const safeName = cleanReceiptItemName(name);
    if (!safeName) return;
    pendingItems.push({ name: safeName, age: 0 });
  };

  for (const row of itemRows) {
    const rowText = normalizeOcrLine(row.text);
    if (!rowText || isReceiptHeaderLine(rowText) || isReceiptMetaLine(rowText) || isReceiptPaymentAreaLine(rowText)) continue;

    pendingItems.forEach((item) => {
      item.age += 1;
    });
    while (pendingItems.length > 0 && pendingItems[0].age > 4) {
      pendingItems.shift();
    }

    const name = getReceiptRowName(row, amountColumnX);
    const moneyWords = getReceiptRowMoneyWords(row);
    const hasName = !!name && isLikelyReceiptItemNameLine(name);
    const isZeroOnlyRow = /^0+(?:\s+0?1)?(?:\s+0+)?$/.test(rowText.replace(/\s+/g, " "));

    if (hasName && moneyWords.length > 0) {
      const amount = selectReceiptCoordinateAmount(row, amountColumnX);
      if (amount > 0) addCandidateItem(name, amount);
      continue;
    }

    if (hasName) {
      pushPending(name);
      continue;
    }

    if (isZeroOnlyRow) {
      pendingItems.shift();
      continue;
    }

    if (moneyWords.length === 0) continue;
    const currentPending = pendingItems[0];
    if (!currentPending) continue;

    const amount = selectReceiptCoordinateAmount(row, amountColumnX, currentPending.unitPrice);
    const onlyOneMoney = moneyWords.length === 1;
    const looksLikeUnitPriceOnly = onlyOneMoney && moneyWords[0].amount < 10_000;

    if (looksLikeUnitPriceOnly && currentPending.age <= 2) {
      currentPending.unitPrice = moneyWords[0].amount;
      continue;
    }

    if (amount > 0) {
      addCandidateItem(currentPending.name, amount);
      pendingItems.shift();
    }
  }

  return directItems;
}
function parseReceiptText(text: string, words: ReceiptOcrWord[] = []): ReceiptParseResult {
  const lines = text
    .split(/\r?\n/)
    .map(normalizeOcrLine)
    .filter(Boolean);

  const itemLines = getReceiptItemAreaLines(lines);
  const directItems: ReceiptItemCandidate[] = [];
  const duplicateItemCounts = new Map<string, number>();

  type PendingReceiptItem = {
    name: string;
    unitPrice?: number;
  };

  const pendingItems: PendingReceiptItem[] = [];

  const addCandidateItem = (name: string, amount: number) => {
    const safeName = cleanReceiptItemName(name);
    if (!safeName || amount <= 0) return;

    const duplicateKey = `${safeName}-${amount}`;
    const duplicateCount = duplicateItemCounts.get(duplicateKey) ?? 0;
    duplicateItemCounts.set(duplicateKey, duplicateCount + 1);

    const displayName =
      duplicateCount === 0
        ? safeName
        : `${safeName}(중복${duplicateCount > 1 ? ` ${duplicateCount + 1}` : ""})`;

    directItems.push({
      id: createId("receipt-item"),
      name: displayName,
      amount,
      category: guessReceiptItemCategory(displayName),
    });
  };

  const pushPendingItem = (name: string) => {
    const safeName = cleanReceiptItemName(name);
    if (!safeName) return;
    pendingItems.push({ name: safeName });
  };

  const dropPendingItem = () => {
    pendingItems.shift();
  };

  const getCurrentPendingItem = () => pendingItems[0];

  const isQuantityOnlyLine = (line: string) => /^0?[0-9]{1,2}$/.test(line.trim());

  const correctAmountWithUnitPrice = (match: ReceiptMoneyMatch, unitPrice?: number) => {
    if (!unitPrice || unitPrice <= 0) return match.amount;

    if (match.amount >= unitPrice && match.amount % unitPrice === 0) {
      return match.amount;
    }

    const digits = match.raw.replace(/[^0-9]/g, "");
    if (digits.length >= 5) {
      const strippedAmount = Number(digits.slice(1));
      if (
        Number.isFinite(strippedAmount) &&
        strippedAmount >= 50 &&
        strippedAmount <= 10_000_000 &&
        strippedAmount >= unitPrice &&
        strippedAmount % unitPrice === 0
      ) {
        return strippedAmount;
      }
    }

    return match.amount;
  };

  const selectAmountForPendingItem = (line: string, pendingItem?: PendingReceiptItem) => {
    const matches = extractReceiptMoneyMatches(line);
    if (matches.length === 0) return 0;

    const selectedMatch = matches.length === 1
      ? matches[0]
      : matches.find((match) => match.amount === selectReceiptRowAmount(matches)) ?? matches[matches.length - 1];

    return correctAmountWithUnitPrice(selectedMatch, pendingItem?.unitPrice);
  };

  for (let index = 0; index < itemLines.length; index += 1) {
    const line = itemLines[index];
    if (!line || isReceiptHeaderLine(line) || isReceiptMetaLine(line) || isReceiptPaymentAreaLine(line)) continue;

    const compactLine = line.replace(/\s/g, "");
    if (/^0+(?:0?1)?0*$/.test(compactLine) || /^0+1$/.test(compactLine)) {
      dropPendingItem();
      continue;
    }

    const moneyMatches = extractReceiptMoneyMatches(line);
    if (moneyMatches.length === 0 && isQuantityOnlyLine(line)) continue;

    const firstMoney = moneyMatches[0];
    const nameBeforeMoney = firstMoney ? cleanReceiptItemName(line.slice(0, firstMoney.index)) : "";

    if (nameBeforeMoney && hasReceiptItemName(nameBeforeMoney)) {
      const amount = selectReceiptRowAmount(moneyMatches);
      if (amount > 0) {
        addCandidateItem(nameBeforeMoney, amount);
      } else {
        pushPendingItem(nameBeforeMoney);
      }
      continue;
    }

    if (isLikelyReceiptItemNameLine(line) && moneyMatches.length === 0) {
      pushPendingItem(line);
      continue;
    }

    if (moneyMatches.length === 0) continue;

    const nextLine = itemLines[index + 1] ?? "";
    const afterNextLine = itemLines[index + 2] ?? "";
    const nextLooksLikeName = isLikelyReceiptItemNameLine(nextLine) && extractReceiptMoneyMatches(nextLine).length === 0;
    const nextIsQuantity = isQuantityOnlyLine(nextLine);
    const afterNextHasMoney = extractReceiptMoneyMatches(afterNextLine).length > 0;
    const currentPending = getCurrentPendingItem();

    // 0원 항목은 실제 정산에 영향이 없으므로 후보로 만들지 않고, 대기 중인 항목만 소비합니다.
    if (moneyMatches.every((match) => match.amount <= 0) || /^0+\s*(?:0?1)?\s*0*$/.test(line.replace(/\s/g, ""))) {
      dropPendingItem();
      continue;
    }

    // 항목명 다음에 단가만 한 줄로 인식되고 바로 다음 항목명 또는 수량/총액 줄이 오는 경우,
    // 단가를 항목 총액으로 확정하지 않고 대기 항목의 단가로만 저장합니다.
    if (
      currentPending &&
      moneyMatches.length === 1 &&
      moneyMatches[0].amount < 10_000 &&
      (nextLooksLikeName || (nextIsQuantity && afterNextHasMoney))
    ) {
      currentPending.unitPrice = moneyMatches[0].amount;
      continue;
    }

    // 수량만 단독으로 읽힌 줄은 금액 후보가 아닙니다.
    if (isQuantityOnlyLine(line)) continue;

    // 항목명 없이 남는 금액은 억지로 "영수증 항목"으로 만들지 않습니다.
    // 항목 합계 경고를 통해 사용자가 누락 여부를 확인하도록 둡니다.
    if (!currentPending) continue;

    const amount = selectAmountForPendingItem(line, currentPending);
    if (amount > 0) {
      addCandidateItem(currentPending.name, amount);
      dropPendingItem();
    }
  }

  const coordinateItems = parseReceiptByCoordinates(words);
  const textItemTotalAmount = directItems.reduce((sum, item) => sum + item.amount, 0);
  const coordinateItemTotalAmount = coordinateItems.reduce((sum, item) => sum + item.amount, 0);
  const textTotalInfo = findReceiptTotalAmount(lines, textItemTotalAmount);
  const coordinateTotalInfo = findReceiptTotalAmount(lines, coordinateItemTotalAmount);
  const textDifference = textTotalInfo.totalAmount > 0
    ? Math.abs(textTotalInfo.totalAmount - textItemTotalAmount)
    : Number.MAX_SAFE_INTEGER;
  const coordinateDifference = coordinateTotalInfo.totalAmount > 0
    ? Math.abs(coordinateTotalInfo.totalAmount - coordinateItemTotalAmount)
    : Number.MAX_SAFE_INTEGER;
  const useCoordinateItems =
    coordinateItems.length > 0 &&
    (directItems.length === 0 || coordinateDifference < textDifference || coordinateItemTotalAmount > textItemTotalAmount);
  const selectedItems = useCoordinateItems ? coordinateItems : directItems;
  const itemTotalAmount = useCoordinateItems ? coordinateItemTotalAmount : textItemTotalAmount;
  const { totalAmount, explicitTotalAmount, paymentInfo } = useCoordinateItems ? coordinateTotalInfo : textTotalInfo;
  const warnings: string[] = [];
  const notices: string[] = [];

  if (useCoordinateItems) {
    notices.push("영수증 표의 좌표 정보를 함께 사용해 항목과 금액을 매칭했어요.");
  }

  if (paymentInfo.prepaidAmount > 0 || paymentInfo.unpaidAmount > 0) {
    notices.push(
      `선결제 ${paymentInfo.prepaidAmount.toLocaleString()}원, 미결제 ${paymentInfo.unpaidAmount.toLocaleString()}원을 찾았어요.`
    );

    if (paymentInfo.splitTotalAmount > 0) {
      notices.push(
        `선결제와 미결제를 합친 ${paymentInfo.splitTotalAmount.toLocaleString()}원을 결제 상태 금액으로 봅니다.`
      );
    }

    if (itemTotalAmount > 0 && paymentInfo.splitTotalAmount > 0 && Math.abs(itemTotalAmount - paymentInfo.splitTotalAmount) <= 1) {
      notices.push(
        `항목 합계와 결제 상태 금액이 일치해 정산 기준 총액은 ${itemTotalAmount.toLocaleString()}원으로 적용합니다.`
      );
    }
  }

  if (totalAmount > 0 && itemTotalAmount > 0 && totalAmount !== itemTotalAmount) {
    const difference = Math.abs(totalAmount - itemTotalAmount);
    warnings.push(
      totalAmount > itemTotalAmount
        ? `영수증 총액보다 항목 합계가 ${difference.toLocaleString()}원 부족합니다. 누락된 항목이 있는지 확인해주세요.`
        : `항목 합계가 영수증 총액보다 ${difference.toLocaleString()}원 많습니다. 잘못 인식된 항목이 있는지 확인해주세요.`
    );
  }

  return { totalAmount, explicitTotalAmount, itemTotalAmount, items: selectedItems, warnings, notices, paymentInfo };
}
function makeDefaultPortion(people: Person[], quantity = 1): DetailItemPortion {
  return {
    id: createId("portion"),
    quantity,
    participantIds: people.map((person) => person.id),
  };
}

function makeDefaultItem(category: SplitItemCategory, people: Person[]): SplitItem {
  const option = itemCategoryOptions.find((item) => item.category === category) ?? itemCategoryOptions[itemCategoryOptions.length - 1];

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
    quantityUnit: getDefaultQuantityUnit(category),
    portions: [makeDefaultPortion(people, 1)],
  };
}

function getDefaultDetailParticipantIds(people: Person[], directPayerId: string): string[] {
  return people
    .filter((person) => person.id !== directPayerId)
    .map((person) => person.id);
}

function getDefaultDirectPayerId(people: Person[], mainPayerId: string): string {
  return people.find((person) => person.id !== mainPayerId)?.id ?? people[0]?.id ?? "";
}

function removeParticipantId(participantIds: string[], personId: string): string[] {
  if (!personId) return participantIds;
  return participantIds.filter((id) => id !== personId);
}

function makeDefaultQuickSupport(people: Person[], excludedIds: string[] = []): QuickSupportInput {
  const excludedIdSet = new Set(excludedIds);
  const payer = people.find((person) => !excludedIdSet.has(person.id)) ?? people[0];

  return {
    id: createId("quick-support"),
    payerId: payer?.id ?? "",
    amount: 0,
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
  const [quickSupportEnabled, setQuickSupportEnabled] = useState(false);
  const [quickSupports, setQuickSupports] = useState<QuickSupportInput[]>([]);
  const [coveredAmount, setCoveredAmount] = useState(0);
  const [splitParticipantIds, setSplitParticipantIds] = useState<string[]>([]);

  const [detailTotalAmount, setDetailTotalAmount] = useState(0);
  const [detailDiscountMode, setDetailDiscountMode] = useState<DiscountInputMode>("amount");
  const [detailDiscountAmount, setDetailDiscountAmount] = useState(0);
  const [detailDiscountPercent, setDetailDiscountPercent] = useState(0);
  const [items, setItems] = useState<SplitItem[]>([]);
  const [detailStep, setDetailStep] = useState<DetailStep>("total");
  const itemCardRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const receiptInputRef = useRef<HTMLInputElement | null>(null);
  const [pendingFocusItemId, setPendingFocusItemId] = useState<string | null>(null);
  const [receiptImageUrl, setReceiptImageUrl] = useState("");
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptFileName, setReceiptFileName] = useState("");
  const [receiptOcrText, setReceiptOcrText] = useState("");
  const [receiptOcrWords, setReceiptOcrWords] = useState<ReceiptOcrWord[]>([]);
  const [receiptOcrError, setReceiptOcrError] = useState("");
  const [receiptOcrProgress, setReceiptOcrProgress] = useState(0);
  const [isReadingReceipt, setIsReadingReceipt] = useState(false);

  const hasAnyInput =
    people.length > 0 ||
    quickTotalAmount > 0 ||
    quickDiscountMode !== "amount" ||
    quickDiscountAmount > 0 ||
    quickDiscountPercent > 0 ||
    quickSupportEnabled ||
    quickSupports.length > 0 ||
    coveredAmount > 0 ||
    detailTotalAmount > 0 ||
    detailDiscountMode !== "amount" ||
    detailDiscountAmount > 0 ||
    detailDiscountPercent > 0 ||
    items.length > 0 ||
    receiptImageUrl !== "" ||
    receiptOcrText !== "" ||
    result !== null;

  const quickDiscountValue =
    quickDiscountMode === "amount"
      ? Math.min(quickDiscountAmount, quickTotalAmount)
      : calculatePercentDiscount(quickTotalAmount, quickDiscountPercent);
  const quickDiscountPercentInvalid = quickDiscountMode === "percent" && quickDiscountPercent > 100;
  const quickSupportTotalAmount = quickSupportEnabled
    ? quickSupports.reduce((sum, support) => sum + Math.max(0, Math.floor(support.amount || 0)), 0)
    : 0;
  const quickSupporterIdsKey = quickSupportEnabled
    ? quickSupports.map((support) => support.payerId).filter(Boolean).join("|")
    : "";
  const quickSupporterIds = useMemo(
    () => (quickSupporterIdsKey ? quickSupporterIdsKey.split("|") : []),
    [quickSupporterIdsKey]
  );
  const quickSettlementAmount = Math.max(0, quickTotalAmount - quickDiscountValue);
  const quickRemainingAmount = Math.max(0, quickSettlementAmount - quickSupportTotalAmount);
  const canGoMethodStep = people.length >= 2;

  const mainPayerIndex = people.findIndex((person) => person.id === mainPayerId);
  const mainPayerName =
    mainPayerIndex >= 0 ? displayName(people[mainPayerIndex], mainPayerIndex) : "대표 결제자";

  const detailItemTotalAmount = useMemo(
    () => items.reduce((sum, item) => sum + Math.max(0, Math.floor(item.amount || 0)), 0),
    [items]
  );
  const detailDiscountValue =
    detailDiscountMode === "amount"
      ? Math.min(detailDiscountAmount, detailTotalAmount)
      : calculatePercentDiscount(detailTotalAmount, detailDiscountPercent);
  const detailDiscountPercentInvalid = detailDiscountMode === "percent" && detailDiscountPercent > 100;
  const detailSettlementAmount = Math.max(0, detailTotalAmount - detailDiscountValue);
  const detailItemDifferenceAmount = detailSettlementAmount - detailItemTotalAmount;
  const receiptParseResult = useMemo(() => parseReceiptText(receiptOcrText, receiptOcrWords), [receiptOcrText, receiptOcrWords]);
  const canGoDetailItemsStep =
    detailTotalAmount > 0 &&
    !detailDiscountPercentInvalid &&
    detailDiscountValue <= detailTotalAmount &&
    !!mainPayerId;
  const canGoDetailSplitStep =
    items.length > 0 && detailItemTotalAmount > 0 && detailItemDifferenceAmount === 0;

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
      errors.push("대표 결제자를 선택해주세요.");
    }

    if (quickSupportEnabled) {
      if (quickSupports.length === 0) {
        errors.push("일부 금액을 내주는 사람을 1명 이상 추가해주세요.");
      }

      quickSupports.forEach((support, index) => {
        if (!support.payerId) {
          errors.push(`${index + 1}번째 지원자를 선택해주세요.`);
        }

        if (support.amount <= 0) {
          errors.push(`${index + 1}번째 지원 금액을 1원 이상 입력해주세요.`);
        }
      });
    }

    if (quickSupportTotalAmount > quickSettlementAmount) {
      errors.push("지원 금액 합계는 정산 대상 금액보다 클 수 없습니다.");
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
    quickSupportEnabled,
    quickSupports,
    quickSupportTotalAmount,
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

    if (items.length === 0) {
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

    if (detailItemTotalAmount <= 0) {
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

    setQuickSupports((currentSupports) => {
      const validPersonIds = new Set(people.map((person) => person.id));
      const validSupports = currentSupports
        .map((support) => ({
          ...support,
          payerId: validPersonIds.has(support.payerId) ? support.payerId : people[0]?.id ?? "",
        }))
        .filter((support) => support.payerId);

      if (validSupports.length > 0) return validSupports;
      return quickSupportEnabled ? [makeDefaultQuickSupport(people)] : [];
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
    if (people.length === 0) {
      setSplitParticipantIds([]);
      return;
    }

    const excludedSupporterIds = new Set(quickSupporterIds);

    setSplitParticipantIds(
      people.filter((person) => !excludedSupporterIds.has(person.id)).map((person) => person.id)
    );
  }, [people, quickSupporterIds]);

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

  useEffect(() => {
    return () => {
      if (receiptImageUrl) {
        URL.revokeObjectURL(receiptImageUrl);
      }
    };
  }, [receiptImageUrl]);

  const openReceiptPicker = () => {
    receiptInputRef.current?.click();
  };

  const handleReceiptFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      event.target.value = "";
      return;
    }

    const nextImageUrl = URL.createObjectURL(file);

    setReceiptImageUrl((currentImageUrl) => {
      if (currentImageUrl) {
        URL.revokeObjectURL(currentImageUrl);
      }
      return nextImageUrl;
    });
    setReceiptFile(file);
    setReceiptFileName(file.name);
    setReceiptOcrText("");
    setReceiptOcrWords([]);
    setReceiptOcrError("");
    setReceiptOcrProgress(0);
    event.target.value = "";
  };

  const removeReceiptImage = () => {
    if (receiptImageUrl) {
      URL.revokeObjectURL(receiptImageUrl);
    }
    setReceiptImageUrl("");
    setReceiptFile(null);
    setReceiptFileName("");
    setReceiptOcrText("");
    setReceiptOcrWords([]);
    setReceiptOcrError("");
    setReceiptOcrProgress(0);
  };

  const runReceiptOcr = async () => {
    if (!receiptFile || isReadingReceipt) return;

    setIsReadingReceipt(true);
    setReceiptOcrError("");
    setReceiptOcrProgress(10);

    try {
      const formData = new FormData();
      formData.append("file", receiptFile);

      const response = await fetch("/api/receipt-ocr", {
        method: "POST",
        body: formData,
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setReceiptOcrError(data.error || "영수증 OCR 요청에 실패했습니다.");
        return;
      }

      const nextText = (data.text || "").trim();
      if (!nextText) {
        setReceiptOcrWords([]);
        setReceiptOcrError("영수증에서 글자를 찾지 못했어요. 사진을 더 선명하게 찍어주세요.");
        return;
      }

      setReceiptOcrText(nextText);
      setReceiptOcrWords(Array.isArray(data.words) ? data.words : []);
      setReceiptOcrProgress(100);
    } catch (error) {
      console.error(error);
      setReceiptOcrError("영수증 OCR 처리 중 오류가 발생했습니다.");
    } finally {
      setIsReadingReceipt(false);
    }
  };

  const makeItemFromReceiptCandidate = (candidate: ReceiptItemCandidate): SplitItem => ({
    ...makeDefaultItem(candidate.category, people),
    id: createId("item"),
    name: candidate.name,
    amount: candidate.amount,
  });

  const applyReceiptTotalToQuick = () => {
    if (receiptParseResult.totalAmount <= 0) return;
    setQuickTotalAmount(receiptParseResult.totalAmount);
  };

  const applyReceiptTotalToDetail = () => {
    if (receiptParseResult.totalAmount <= 0) return;
    setDetailTotalAmount(receiptParseResult.totalAmount);
  };

  const addReceiptItemsToDetail = () => {
    if (receiptParseResult.items.length === 0) return;
    const nextItems = receiptParseResult.items.map(makeItemFromReceiptCandidate);
    setItems((current) => [...current, ...nextItems]);
    setDetailStep("items");
    setPendingFocusItemId(nextItems[0]?.id ?? null);
  };

  const replaceDetailWithReceiptResult = () => {
    const nextItems = receiptParseResult.items.map(makeItemFromReceiptCandidate);

    if (receiptParseResult.totalAmount > 0) {
      setDetailTotalAmount(receiptParseResult.totalAmount);
    }

    setItems(nextItems);
    setDetailStep("items");
    setPendingFocusItemId(nextItems[0]?.id ?? null);
  };

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

  const selectExceptQuickSupporters = () => {
    const supporterIds = new Set(quickSupporterIds);
    setSplitParticipantIds(
      people.filter((person) => !supporterIds.has(person.id)).map((person) => person.id)
    );
  };

  const addQuickSupport = () => {
    setQuickSupportEnabled(true);
    setQuickSupports((current) => [
      ...current,
      makeDefaultQuickSupport(
        people,
        current.map((support) => support.payerId)
      ),
    ]);
  };

  const updateQuickSupport = (
    supportId: string,
    updater: (support: QuickSupportInput) => QuickSupportInput
  ) => {
    setQuickSupports((current) => current.map((support) => (support.id === supportId ? updater(support) : support)));
  };

  const removeQuickSupport = (supportId: string) => {
    setQuickSupports((current) => current.filter((support) => support.id !== supportId));
  };

  const resetQuickSupports = () => {
    setQuickSupportEnabled(false);
    setQuickSupports([]);
  };

  const clearSplitParticipants = () => {
    setSplitParticipantIds([]);
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

  const clearItemParticipants = (itemId: string) => {
    updateItem(itemId, (item) => ({ ...item, participantIds: [] }));
  };

  const resetItemParticipants = (itemId: string) => {
    updateItem(itemId, (item) => ({
      ...item,
      participantIds: getDefaultDetailParticipantIds(people, item.directPayerId),
    }));
  };

  const updateItemDirectPayer = (itemId: string, directPayerId: string) => {
    updateItem(itemId, (item) => ({
      ...item,
      directPayerId,
      participantIds: getDefaultDetailParticipantIds(people, directPayerId),
      portions: item.portions.map((portion) => ({
        ...portion,
        participantIds: getDefaultDetailParticipantIds(people, directPayerId),
      })),
    }));
  };

  const enableItemDirectSupport = (itemId: string, checked: boolean) => {
    updateItem(itemId, (item) => {
      if (!checked) {
        return {
          ...item,
          directPayerId: "",
          directCoveredAmount: 0,
        };
      }

      const nextDirectPayerId = item.directPayerId || getDefaultDirectPayerId(people, mainPayerId);
      return {
        ...item,
        directPayerId: nextDirectPayerId,
        directCoveredAmount: item.directCoveredAmount,
        participantIds: getDefaultDetailParticipantIds(people, nextDirectPayerId),
        portions: item.portions.map((portion) => ({
          ...portion,
          participantIds: getDefaultDetailParticipantIds(people, nextDirectPayerId),
        })),
      };
    });
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

  const clearPortionParticipants = (itemId: string, portionId: string) => {
    updateItemPortion(itemId, portionId, (portion) => ({
      ...portion,
      participantIds: [],
    }));
  };

  const resetPortionParticipants = (itemId: string, portionId: string) => {
    updateItem(itemId, (item) => ({
      ...item,
      portions: item.portions.map((portion) =>
        portion.id === portionId
          ? { ...portion, participantIds: getDefaultDetailParticipantIds(people, item.directPayerId) }
          : portion
      ),
    }));
  };

  const handleCalculateQuick = () => {
    if (!canCalculateQuick) return;

    const calculationResult = calculateDutchPay({
      totalAmount: quickTotalAmount,
      discountAmount: quickDiscountValue,
      people,
      mainPayerId,
      supportContributions: quickSupportEnabled ? quickSupports : [],
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
    setQuickSupportEnabled(false);
    setQuickSupports([]);
    setCoveredAmount(0);
    setSplitParticipantIds([]);
    setDetailTotalAmount(0);
    setDetailDiscountMode("amount");
    setDetailDiscountAmount(0);
    setDetailDiscountPercent(0);
    setItems([]);
    setDetailStep("total");
    removeReceiptImage();
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
        대표 결제자를 선택해주세요. 전체 금액을 먼저 결제한 사람이며, 정산 결과에서 이 사람이 돈을 받게 됩니다.
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

  const renderReceiptUploadSection = (description: string, applyMode: ReceiptApplyMode) => (
    <section className="p-4 border border-dashed border-border rounded-2xl bg-muted/30 space-y-3">
      <input
        ref={receiptInputRef}
        type="file"
        accept="image/*"
        onChange={handleReceiptFileChange}
        className="hidden"
      />

      <div className="flex items-center gap-2 font-medium">
        <ReceiptText className="w-4 h-4" />
        <span>영수증 사진 추가</span>
      </div>

      <p className="text-sm text-muted-foreground">{description}</p>

      {receiptImageUrl ? (
        <div className="space-y-3">
          <div className="overflow-hidden rounded-xl border border-border bg-background">
            <img
              src={receiptImageUrl}
              alt="영수증 미리보기"
              className="max-h-80 w-full object-contain bg-muted/40"
            />
          </div>

          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="min-w-0 truncate text-muted-foreground">
              {receiptFileName || "영수증 이미지"}
            </span>
            <div className="flex gap-2 shrink-0">
              <Button type="button" variant="outline" size="sm" onClick={openReceiptPicker}>
                이미지 변경
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={removeReceiptImage}>
                제거
              </Button>
            </div>
          </div>

          <div className="space-y-3 rounded-xl border border-border bg-background p-3">
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={runReceiptOcr}
                disabled={isReadingReceipt}
              >
                {isReadingReceipt ? "영수증 읽는 중" : "영수증 글자 읽기"}
              </Button>

              {receiptOcrText && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setReceiptOcrText("");
                    setReceiptOcrError("");
                    setReceiptOcrProgress(0);
                  }}
                >
                  OCR 결과 초기화
                </Button>
              )}
            </div>

            {isReadingReceipt && (
              <p className="text-sm text-muted-foreground">
                영수증을 읽는 중입니다. 처음 실행할 때는 시간이 조금 걸릴 수 있어요.
                {receiptOcrProgress > 0 && ` (${receiptOcrProgress}%)`}
              </p>
            )}

            {receiptOcrError && (
              <p className="text-sm font-medium text-destructive">{receiptOcrError}</p>
            )}

            {receiptOcrText && (
              <div className="space-y-3">
                <div className="rounded-lg bg-muted/50 p-3 text-sm">
                  <div className="flex justify-between gap-3">
                    <span className="text-muted-foreground">찾은 정산 기준 총액</span>
                    <span className="font-semibold">
                      {receiptParseResult.totalAmount > 0
                        ? `${receiptParseResult.totalAmount.toLocaleString()}원`
                        : "없음"}
                    </span>
                  </div>
                  <div className="flex justify-between gap-3 pt-1">
                    <span className="text-muted-foreground">찾은 항목 후보</span>
                    <span className="font-semibold">{receiptParseResult.items.length}개</span>
                  </div>
                  <div className="flex justify-between gap-3 pt-1">
                    <span className="text-muted-foreground">항목 합계</span>
                    <span className="font-semibold">{receiptParseResult.itemTotalAmount.toLocaleString()}원</span>
                  </div>
                  {(receiptParseResult.paymentInfo.prepaidAmount > 0 || receiptParseResult.paymentInfo.unpaidAmount > 0) && (
                    <div className="mt-2 border-t border-border pt-2 text-xs text-muted-foreground">
                      <p className="font-medium text-foreground">결제 상태 정보</p>
                      {receiptParseResult.paymentInfo.prepaidAmount > 0 && (
                        <div className="flex justify-between gap-3 pt-1">
                          <span>선결제</span>
                          <span>{receiptParseResult.paymentInfo.prepaidAmount.toLocaleString()}원</span>
                        </div>
                      )}
                      {receiptParseResult.paymentInfo.unpaidAmount > 0 && (
                        <div className="flex justify-between gap-3 pt-1">
                          <span>미결제</span>
                          <span>{receiptParseResult.paymentInfo.unpaidAmount.toLocaleString()}원</span>
                        </div>
                      )}
                      {receiptParseResult.paymentInfo.splitTotalAmount > 0 && (
                        <div className="flex justify-between gap-3 pt-1 font-medium text-foreground">
                          <span>선결제 + 미결제</span>
                          <span>{receiptParseResult.paymentInfo.splitTotalAmount.toLocaleString()}원</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {receiptParseResult.notices.length > 0 && (
                  <div className="space-y-1 rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm text-primary">
                    {receiptParseResult.notices.map((notice) => (
                      <p key={notice}>• {notice}</p>
                    ))}
                  </div>
                )}

                {receiptParseResult.warnings.length > 0 && (
                  <div className="space-y-1 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                    {receiptParseResult.warnings.map((warning) => (
                      <p key={warning}>• {warning}</p>
                    ))}
                  </div>
                )}

                {receiptParseResult.items.length > 0 && (
                  <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-border p-2 text-sm">
                    {receiptParseResult.items.map((item) => (
                      <div key={item.id} className="flex items-center justify-between gap-3 rounded-md px-2 py-1">
                        <div className="min-w-0">
                          <span className="block truncate">{item.name}</span>
                          <span className="text-xs text-muted-foreground">자동 항목</span>
                        </div>
                        <span className="shrink-0 font-medium">{item.amount.toLocaleString()}원</span>
                      </div>
                    ))}
                  </div>
                )}

                <details className="rounded-lg border border-border p-3 text-sm">
                  <summary className="cursor-pointer font-medium">OCR 원문 보기</summary>
                  <pre className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap text-xs text-muted-foreground">
                    {receiptOcrText}
                  </pre>
                </details>

                {applyMode === "quick" ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={applyReceiptTotalToQuick}
                    disabled={receiptParseResult.totalAmount <= 0}
                  >
                    총액을 빠른 계산에 반영
                  </Button>
                ) : (
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={applyReceiptTotalToDetail}
                      disabled={receiptParseResult.totalAmount <= 0}
                    >
                      총액 반영
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={addReceiptItemsToDetail}
                      disabled={receiptParseResult.items.length === 0}
                    >
                      항목 추가
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      onClick={replaceDetailWithReceiptResult}
                      disabled={receiptParseResult.totalAmount <= 0 && receiptParseResult.items.length === 0}
                    >
                      총액+항목으로 교체
                    </Button>
                  </div>
                )}

                <p className="text-xs text-muted-foreground">
                  OCR 결과는 틀릴 수 있어요. 반영 후 총액과 항목 금액을 반드시 확인해주세요.
                </p>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button type="button" variant="outline" size="sm" onClick={openReceiptPicker}>
            사진 선택
          </Button>
          <p className="text-xs text-muted-foreground sm:self-center">
            JPG, PNG 등 이미지 파일을 올릴 수 있어요.
          </p>
        </div>
      )}
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
                      음식, 술, 음료, 택시, 노래방처럼 항목별로 참여자를 다르게 선택해요.
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
                단순하게 N분의 1로 나누거나, 누군가 일부 금액을 내주고 남은 금액만 선택한 사람들이 나눠 낼 수 있습니다.
              </p>
              <p className="text-sm text-muted-foreground">
                대표 결제자는 실제로 먼저 결제한 사람이고, 내주는 사람은 대표 결제자와 다를 수 있습니다.
              </p>
            </div>

            {renderReceiptUploadSection(
              "영수증 사진에서 총액을 자동으로 읽고, 필요하면 직접 수정할 수 있어요.",
              "quick"
            )}

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
                  className="text-2xl font-bold h-16 pl-20 pr-12 text-right"
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

              {quickDiscountMode === "amount" ? (
                <div className="relative">
                  <Input
                    type="text"
                    inputMode="numeric"
                    value={quickDiscountAmount || ""}
                    onChange={(event) => setQuickDiscountAmount(parseMoneyInput(event.target.value))}
                    placeholder="입력하지 않으면 0원"
                    className="h-14 pl-20 pr-12 text-right"
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
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="relative">
                    <Input
                      type="text"
                      inputMode="decimal"
                      value={quickDiscountPercent || ""}
                      onChange={(event) => setQuickDiscountPercent(parsePercentInput(event.target.value))}
                      placeholder="예: 10"
                      className="h-14 pl-20 pr-10 text-right"
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
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {quickTotalAmount.toLocaleString()}원의 {quickDiscountPercent || 0}% 할인 = {quickDiscountValue.toLocaleString()}원 할인
                  </p>
                </div>
              )}
            </section>

            {renderMainPayerPicker()}

            <section className="space-y-4 p-4 border border-border bg-card rounded-2xl">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={quickSupportEnabled}
                  onChange={(event) => {
                    const checked = event.target.checked;
                    setQuickSupportEnabled(checked);
                    if (checked) {
                      setQuickSupports((current) =>
                        current.length > 0 ? current : [makeDefaultQuickSupport(people)]
                      );
                    } else {
                      setQuickSupports([]);
                    }
                  }}
                  className="mt-1 h-4 w-4 rounded border-border"
                />
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <div className="p-2 bg-primary/10 text-primary rounded-xl shrink-0">
                      <Gift className="w-5 h-5" />
                    </div>
                    <h3 className="font-semibold">일부 금액을 내주는 사람이 있어요</h3>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    예: “안주값 30,000원은 내가 낼게”처럼 일부 금액을 내주는 사람이 있을 때만 사용합니다. 없으면 체크하지 않아도 됩니다.
                  </p>
                </div>
              </label>

              {quickSupportEnabled && (
                <div className="space-y-3">
                  {quickSupports.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
                      아래 버튼으로 지원자를 추가해주세요.
                    </div>
                  ) : (
                    quickSupports.map((support, supportIndex) => {
                      const supportPayerIndex = people.findIndex((person) => person.id === support.payerId);
                      const supportPayerName =
                        supportPayerIndex >= 0 ? displayName(people[supportPayerIndex], supportPayerIndex) : `지원자 ${supportIndex + 1}`;

                      return (
                        <div key={support.id} className="rounded-2xl border border-border bg-muted/20 p-3 space-y-3">
                          <div className="flex items-center justify-between gap-2">
                            <h4 className="font-semibold">지원자 {supportIndex + 1}</h4>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => removeQuickSupport(support.id)}
                              className="text-muted-foreground"
                            >
                              <Trash2 className="w-4 h-4 mr-1" />
                              삭제
                            </Button>
                          </div>

                          <div className="space-y-2">
                            <p className="text-sm font-medium">누가 내주나요?</p>
                            <div className="grid grid-cols-2 gap-2">
                              {people.map((person, index) => (
                                <button
                                  key={person.id}
                                  type="button"
                                  onClick={() =>
                                    updateQuickSupport(support.id, (current) => ({
                                      ...current,
                                      payerId: person.id,
                                    }))
                                  }
                                  className={
                                    person.id === support.payerId
                                      ? "p-3 rounded-xl border border-primary bg-primary/10 text-primary font-semibold text-left"
                                      : "p-3 rounded-xl border border-border bg-card hover:bg-muted/50 text-left"
                                  }
                                >
                                  {displayName(person, index)}
                                  {person.id === mainPayerId && (
                                    <span className="ml-2 text-xs bg-primary/10 text-primary px-2 py-1 rounded-full">
                                      대표 결제자
                                    </span>
                                  )}
                                </button>
                              ))}
                            </div>
                          </div>

                          <div className="space-y-2">
                            <h3 className="font-semibold">{supportPayerName}님이 직접 부담할 금액</h3>
                            <div className="relative">
                              <Input
                                type="text"
                                inputMode="numeric"
                                value={support.amount || ""}
                                onChange={(event) =>
                                  updateQuickSupport(support.id, (current) => ({
                                    ...current,
                                    amount: parseMoneyInput(event.target.value),
                                  }))
                                }
                                placeholder="예: 30000"
                                className="h-14 pl-20 pr-12 text-right"
                              />
                              {support.amount > 0 && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    updateQuickSupport(support.id, (current) => ({
                                      ...current,
                                      amount: 0,
                                    }))
                                  }
                                  className="absolute left-3 top-1/2 -translate-y-1/2 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
                                >
                                  초기화
                                </button>
                              )}
                              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground font-medium">
                                원
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}

                  <div className="flex gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={addQuickSupport}>
                      <Plus className="w-4 h-4 mr-1" />
                      지원자 추가
                    </Button>
                    <Button type="button" variant="outline" size="sm" onClick={resetQuickSupports}>
                      지원 없음으로 초기화
                    </Button>
                  </div>

                  <p className="text-xs text-muted-foreground">
                    지원 금액 합계를 뺀 나머지를 아래에서 선택한 사람들이 나눠 냅니다. 지원자도 다시 선택하면 남은 금액을 같이 나눌 수 있습니다.
                  </p>
                </div>
              )}
            </section>

            <section className="space-y-3">
              <div>
                <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                  남은 금액을 누가 나눠 내나요?
                </h3>
                <p className="text-sm text-muted-foreground mt-1">
                  기본값은 내주는 사람만 제외합니다. 필요하면 다시 체크해서 같이 나눌 수 있습니다.
                </p>
              </div>

              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" onClick={selectExceptQuickSupporters}>
                  지원자 제외
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={selectAllSplitParticipants}>
                  전체 선택
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={clearSplitParticipants}>
                  전체 해제
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
                      <span className="ml-auto flex gap-1">
                        {person.id === mainPayerId && (
                          <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded-full">
                            대표 결제자
                          </span>
                        )}
                        {quickSupporterIds.includes(person.id) && (
                          <span className="text-xs bg-muted text-muted-foreground px-2 py-1 rounded-full">
                            지원자
                          </span>
                        )}
                      </span>
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
                <span className="text-muted-foreground">지원 금액 합계</span>
                <span className="font-medium">-{quickSupportTotalAmount.toLocaleString()}원</span>
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
                {renderReceiptUploadSection(
                  "영수증 사진에서 총액과 항목 후보를 자동으로 읽고, 필요하면 직접 수정할 수 있어요.",
                  "detail"
                )}

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
                        className="text-2xl font-bold h-16 pl-20 pr-12 text-right"
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

                    {detailDiscountMode === "amount" ? (
                      <div className="relative">
                        <Input
                          type="text"
                          inputMode="numeric"
                          value={detailDiscountAmount || ""}
                          onChange={(event) => setDetailDiscountAmount(parseMoneyInput(event.target.value))}
                          placeholder="입력하지 않으면 0원"
                          className="h-14 pl-20 pr-12 text-right"
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
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div className="relative">
                          <Input
                            type="text"
                            inputMode="decimal"
                            value={detailDiscountPercent || ""}
                            onChange={(event) => setDetailDiscountPercent(parsePercentInput(event.target.value))}
                            placeholder="예: 10"
                            className="h-14 pl-20 pr-10 text-right"
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
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {detailTotalAmount.toLocaleString()}원의 {detailDiscountPercent || 0}% 할인 = {detailDiscountValue.toLocaleString()}원 할인
                        </p>
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground">
                      할인 후 실제로 나눌 금액에 맞춰 항목 금액을 입력합니다.
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
                    음식, 술, 음료, 노래방은 분류일 뿐입니다. 맥주, 소주, 카스, 코인노래방처럼 실제 항목명은 카드 안에서 입력하세요.
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
                              <h4 className="font-semibold">{item.name.trim() || `항목 ${itemIndex + 1}`}</h4>
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
                                  className="h-12 pl-20 pr-10 text-right"
                                />
                                <button
                                  type="button"
                                  onClick={() => updateItem(item.id, (current) => ({ ...current, amount: 0 }))}
                                  className="absolute left-3 top-1/2 -translate-y-1/2 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
                                >
                                  초기화
                                </button>
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
                                onChange={(event) => enableItemDirectSupport(item.id, event.target.checked)}
                                className="h-4 w-4 rounded border-border"
                              />
                              이 항목에서 누가 일부 금액을 부담하나요?
                            </label>

                            {(item.directCoveredAmount > 0 || !!item.directPayerId) && (
                              <div className="space-y-3">
                                <div className="space-y-2">
                                  <p className="text-sm text-muted-foreground">부담자</p>
                                  <div className="grid grid-cols-2 gap-2">
                                    {people.map((person, index) => (
                                      <button
                                        key={person.id}
                                        type="button"
                                        onClick={() => updateItemDirectPayer(item.id, person.id)}
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
                                  <p className="text-sm text-muted-foreground">직접 부담 금액</p>
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
                                      className="h-12 pl-20 pr-10 text-right"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => updateItem(item.id, (current) => ({ ...current, directCoveredAmount: 0 }))}
                                      className="absolute left-3 top-1/2 -translate-y-1/2 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
                                    >
                                      초기화
                                    </button>
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
                                    <span className="text-muted-foreground">직접 부담</span>
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
                                    <span className="text-muted-foreground">나머지 계산할 금액</span>
                                    <span className="font-semibold">{Math.max(0, item.amount - item.directCoveredAmount).toLocaleString()}원</span>
                                  </div>

                                  {item.directCoveredAmount > item.amount && (
                                    <p className="pt-2 text-sm font-medium text-destructive">
                                      직접 부담 금액은 항목 금액보다 클 수 없어요.
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
                    각 항목마다 다 같이 똑같이 나눌지, 사용량이 다른지 선택하세요.
                  </p>
                </section>

                {items.length === 0 ? (
                  <div className="p-5 text-center border border-dashed border-border rounded-2xl text-muted-foreground">
                    항목이 없습니다. 이전 단계에서 항목을 추가해주세요.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {items.map((item, itemIndex) => {
                      const wording = getItemWording(item.category);

                      return (
                        <div key={item.id} className="p-4 border border-border bg-card rounded-2xl space-y-4">
                        <div className="space-y-1">
                          <p className="text-sm text-primary font-medium">{getCategoryLabel(item.category)} 항목</p>
                          <h4 className="font-semibold">{item.name.trim() || `항목 ${itemIndex + 1}`}</h4>
                          <p className="text-sm text-muted-foreground">총 {item.amount.toLocaleString()}원</p>
                          {item.directCoveredAmount > 0 && (
                            <p className="text-xs text-muted-foreground">
                              직접 부담 {Math.min(item.directCoveredAmount, item.amount).toLocaleString()}원 · 나눌 금액 {Math.max(0, item.amount - item.directCoveredAmount).toLocaleString()}원
                            </p>
                          )}
                        </div>

                        <div className="space-y-2">
                          <p className="text-sm font-medium">어떻게 나눌까요?</p>
                          <div className="grid grid-cols-2 gap-2">
                            <Button
                              type="button"
                              variant={item.splitMode === "equal" ? "default" : "outline"}
                              onClick={() => updateItemSplitMode(item.id, "equal")}
                              className="h-11"
                            >
                              다 같이 똑같이
                            </Button>
                            <Button
                              type="button"
                              variant={item.splitMode === "quantity" ? "default" : "outline"}
                              onClick={() => updateItemSplitMode(item.id, "quantity")}
                              className="h-11"
                            >
                              {wording.quantityModeLabel}
                            </Button>
                          </div>
                        </div>

                        {item.splitMode === "equal" ? (
                          <div className="space-y-2">
                            <div className="flex items-center justify-between gap-2">
                              <div>
                                <p className="text-sm font-medium">{wording.participantLabel}</p>
                                {item.directPayerId && (
                                  <p className="text-xs text-muted-foreground">기본값은 직접 부담자를 제외합니다. 필요하면 다시 체크할 수 있습니다.</p>
                                )}
                              </div>
                              <div className="flex flex-wrap justify-end gap-2">
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
                                  onClick={() => clearItemParticipants(item.id)}
                                >
                                  전체 해제
                                </Button>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => resetItemParticipants(item.id)}
                                >
                                  기본값
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
                                <label className="text-sm text-muted-foreground">{wording.totalQuantityLabel}</label>
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
                                    placeholder={wording.totalQuantityPlaceholder}
                                    className="h-12 pl-20 text-right"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => updateItem(item.id, (current) => ({ ...current, totalQuantity: 1 }))}
                                    className="absolute left-3 top-1/2 -translate-y-1/2 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
                                  >
                                    초기화
                                  </button>
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
                                    onClick={() => updateItem(item.id, (current) => ({ ...current, quantityUnit: getDefaultQuantityUnit(current.category) }))}
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
                                  <p className="text-sm font-medium">{wording.portionGroupTitle}</p>
                                  <p className="text-xs text-muted-foreground">
                                    {wording.portionExample}
                                  </p>
                                </div>
                                <Button type="button" variant="outline" size="sm" onClick={() => addItemPortion(item.id)}>
                                  <Plus className="w-4 h-4 mr-1" />
                                  {wording.addPortionLabel}
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
                                        <p className="text-sm font-semibold">{wording.portionQuantityLabel} {portionIndex + 1}</p>
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
                                            placeholder={wording.portionQuantityPlaceholder}
                                            className="h-11 pl-20 text-right"
                                          />
                                          <button
                                            type="button"
                                            onClick={() => updateItemPortion(item.id, portion.id, (current) => ({ ...current, quantity: 1 }))}
                                            className="absolute left-3 top-1/2 -translate-y-1/2 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
                                          >
                                            초기화
                                          </button>
                                        </div>
                                        <span className="text-sm text-muted-foreground min-w-10">
                                          {item.quantityUnit || "단위"}
                                        </span>
                                      </div>

                                      <div className="flex items-center justify-between gap-2">
                                        <p className="text-sm font-medium">{wording.portionParticipantLabel}</p>
                                        <div className="flex flex-wrap justify-end gap-2">
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
                                            onClick={() => clearPortionParticipants(item.id, portion.id)}
                                          >
                                            전체 해제
                                          </Button>
                                          <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            onClick={() => resetPortionParticipants(item.id, portion.id)}
                                          >
                                            기본값
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
                      );
                    })}
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
                  <div className="flex justify-between text-sm pt-2 border-t border-border">
                    <span className="text-muted-foreground">실제로 나눌 금액</span>
                    <span className="font-semibold">{detailSettlementAmount.toLocaleString()}원</span>
                  </div>
                  <p className="text-xs text-muted-foreground pt-2">
                    할인 후 실제로 나눌 금액을 기준으로 항목을 입력합니다.
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
                              {getCategoryLabel(item.category)} · {item.directCoveredAmount >= item.amount ? "직접 부담" : item.splitMode === "equal" ? "다 같이 똑같이" : getItemWording(item.category).quantityModeLabel}
                            </p>
                          </div>
                          <p className="font-semibold">{item.amount.toLocaleString()}원</p>
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
