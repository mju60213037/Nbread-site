import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const GEMINI_API_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";
const DEFAULT_MODEL = "gemini-2.5-flash";
const MAX_MONEY = 999_999_999_999;
const MODEL_BUSY_MESSAGE = "현재 AI 영수증 분석 요청이 많습니다. 5~10초 정도 기다린 뒤 다시 시도해주세요.";

type ReceiptDiscountType = "none" | "amount" | "percent" | "mixed" | "unknown";

type GeminiReceiptItem = {
  name?: unknown;
  unitPrice?: unknown;
  quantity?: unknown;
  amount?: unknown;
  confidence?: unknown;
  warning?: unknown;
};

type GeminiDiscountItem = {
  name?: unknown;
  type?: unknown;
  amount?: unknown;
  percent?: unknown;
};

type GeminiReceiptResponse = {
  isReceipt?: unknown;
  receiptType?: unknown;
  analysisSummary?: unknown;
  totalAmount?: unknown;
  originalTotalAmount?: unknown;
  explicitTotalAmount?: unknown;
  totalAmountReason?: unknown;
  items?: unknown;
  discountInfo?: unknown;
  paymentInfo?: unknown;
  warnings?: unknown;
  notices?: unknown;
};

function jsonResponse(body: unknown, status = 200) {
  return NextResponse.json(body, { status });
}

function getEnvValue(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(`${name} 환경변수가 비어 있습니다.`);
  }
  return value.trim();
}

function getModelName(): string {
  return process.env.RECEIPT_ANALYSIS_MODEL?.trim() || DEFAULT_MODEL;
}

function getMaxFileSizeBytes(): number {
  const maxMb = Number(process.env.RECEIPT_MAX_FILE_SIZE_MB || "5");
  return Math.max(1, maxMb) * 1024 * 1024;
}

function isAllowedImageType(type: string): boolean {
  return ["image/jpeg", "image/jpg", "image/png", "image/webp"].includes(type);
}

function safeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function safeNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.min(MAX_MONEY, Math.floor(value)));
  }

  if (typeof value === "string") {
    const normalized = value.replace(/[^0-9.]/g, "");
    const numberValue = Number(normalized);
    if (Number.isFinite(numberValue)) {
      return Math.max(0, Math.min(MAX_MONEY, Math.floor(numberValue)));
    }
  }

  return 0;
}

function safePercent(value: unknown): number {
  const percent = safeNumber(value);
  return Math.max(0, Math.min(100, percent));
}

function safeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(safeString).filter(Boolean).slice(0, 20);
}

function createReceiptItemId(index: number): string {
  return `receipt-item-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`;
}

function stripJsonFence(value: string): string {
  const trimmed = value.trim();
  if (!trimmed.startsWith("```")) return trimmed;
  return trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```$/i, "")
    .trim();
}

function parseGeminiJson(text: string): GeminiReceiptResponse {
  const cleanText = stripJsonFence(text);
  return JSON.parse(cleanText) as GeminiReceiptResponse;
}

function normalizeDiscountInfo(value: unknown) {
  const source = typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
  const rawType = safeString(source.discountType);
  const discountType: ReceiptDiscountType = ["none", "amount", "percent", "mixed", "unknown"].includes(rawType)
    ? rawType as ReceiptDiscountType
    : "none";
  const discountItems = Array.isArray(source.discountItems)
    ? source.discountItems.map((item, index) => {
        const nextItem = typeof item === "object" && item !== null ? item as GeminiDiscountItem : {};
        const rawItemType = safeString(nextItem.type);
        const type = ["amount", "percent", "unknown"].includes(rawItemType)
          ? rawItemType as "amount" | "percent" | "unknown"
          : "unknown";

        return {
          name: safeString(nextItem.name) || `할인 ${index + 1}`,
          type,
          amount: safeNumber(nextItem.amount),
          percent: safePercent(nextItem.percent),
        };
      }).filter((item) => item.amount > 0 || item.percent > 0).slice(0, 20)
    : [];

  const discountAmount = safeNumber(source.discountAmount) || discountItems.reduce((sum, item) => sum + item.amount, 0);
  const discountPercent = safePercent(source.discountPercent);

  return {
    discountType: discountAmount > 0 || discountPercent > 0 ? discountType : "none" as ReceiptDiscountType,
    discountAmount,
    discountPercent,
    discountReason: safeString(source.discountReason),
    discountItems,
  };
}

function normalizePaymentInfo(value: unknown) {
  const source = typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
  const prepaidAmount = safeNumber(source.prepaidAmount);
  const unpaidAmount = safeNumber(source.unpaidAmount);
  const splitTotalAmount = safeNumber(source.splitTotalAmount) || prepaidAmount + unpaidAmount;

  return { prepaidAmount, unpaidAmount, splitTotalAmount };
}

function normalizeGeminiResult(raw: GeminiReceiptResponse) {
  const items = Array.isArray(raw.items)
    ? raw.items.map((item, index) => {
        const source = typeof item === "object" && item !== null ? item as GeminiReceiptItem : {};
        return {
          id: createReceiptItemId(index),
          name: safeString(source.name),
          amount: safeNumber(source.amount),
          category: "etc" as const,
        };
      }).filter((item) => item.name && item.amount > 0).slice(0, 100)
    : [];

  const itemTotalAmount = items.reduce((sum, item) => sum + item.amount, 0);
  const discountInfo = normalizeDiscountInfo(raw.discountInfo);
  const paymentInfo = normalizePaymentInfo(raw.paymentInfo);
  const originalTotalAmount = safeNumber(raw.originalTotalAmount) || itemTotalAmount;
  const totalAmount = safeNumber(raw.totalAmount) || Math.max(0, originalTotalAmount - discountInfo.discountAmount) || itemTotalAmount;
  const explicitTotalAmount = safeNumber(raw.explicitTotalAmount);
  const warnings = safeStringArray(raw.warnings);
  const notices = safeStringArray(raw.notices);
  const analysisSummary = safeString(raw.analysisSummary);
  const totalAmountReason = safeString(raw.totalAmountReason);

  if (totalAmount > 0 && originalTotalAmount > 0 && discountInfo.discountAmount > 0) {
    const expectedFinalAmount = Math.max(0, originalTotalAmount - discountInfo.discountAmount);
    if (Math.abs(expectedFinalAmount - totalAmount) > 1) {
      warnings.push(
        `분석된 할인 전 금액과 할인 금액을 계산한 값(${expectedFinalAmount.toLocaleString()}원)이 최종 결제금액(${totalAmount.toLocaleString()}원)과 일치하지 않습니다. 확인해주세요.`
      );
    }
  }

  if (itemTotalAmount > 0 && originalTotalAmount > 0 && Math.abs(itemTotalAmount - originalTotalAmount) > 1) {
    const difference = Math.abs(itemTotalAmount - originalTotalAmount);
    warnings.push(
      itemTotalAmount < originalTotalAmount
        ? `항목 합계가 할인 전 총액보다 ${difference.toLocaleString()}원 부족합니다. 누락된 항목이 있는지 확인해주세요.`
        : `항목 합계가 할인 전 총액보다 ${difference.toLocaleString()}원 많습니다. 잘못 인식된 항목이 있는지 확인해주세요.`
    );
  }

  const nextNotices = [
    ...notices,
    totalAmountReason,
    discountInfo.discountReason,
    "Gemini 2.5 Flash로 영수증을 분석했습니다.",
  ].filter(Boolean);

  return {
    analysisText: [analysisSummary, totalAmountReason].filter(Boolean).join("\n") || "영수증 분석이 완료되었습니다.",
    result: {
      originalTotalAmount,
      totalAmount,
      explicitTotalAmount,
      itemTotalAmount,
      items,
      discountInfo,
      warnings: Array.from(new Set(warnings)),
      notices: Array.from(new Set(nextNotices)),
      paymentInfo,
    },
  };
}

function buildReceiptAnalysisPrompt(): string {
  return `너는 한국어 영수증 이미지를 더치페이 계산기에 넣기 위한 구조화 도우미다.

반드시 JSON만 반환한다. 설명 문장, markdown, 코드블록을 반환하지 않는다.

반환 JSON 형식:
{
  "isReceipt": true,
  "receiptType": "restaurant | cafe | bar | stay | karaoke | taxi | mart | delivery | online_order | unknown",
  "analysisSummary": "분석 요약",
  "originalTotalAmount": 0,
  "totalAmount": 0,
  "explicitTotalAmount": 0,
  "totalAmountReason": "정산 기준 총액 판단 근거",
  "items": [
    {
      "name": "항목명",
      "unitPrice": 0,
      "quantity": 1,
      "amount": 0,
      "confidence": "high | medium | low",
      "warning": ""
    }
  ],
  "discountInfo": {
    "discountType": "none | amount | percent | mixed | unknown",
    "discountAmount": 0,
    "discountPercent": 0,
    "discountReason": "할인 판단 근거",
    "discountItems": [
      { "name": "쿠폰할인", "type": "amount | percent | unknown", "amount": 0, "percent": 0 }
    ]
  },
  "paymentInfo": {
    "prepaidAmount": 0,
    "unpaidAmount": 0,
    "splitTotalAmount": 0
  },
  "warnings": [],
  "notices": []
}

영수증 여부 판단:
- 음식점, 카페, 술집, 숙소, 노래방, 택시, 마트, 편의점, 배달앱 주문 내역, 모바일 결제 내역은 영수증으로 본다.
- 음식 사진, 사람 사진, 풍경, 일반 문서, 포스터, 메모처럼 결제 내역이 없는 이미지는 isReceipt=false로 반환한다.

총액 판단 규칙:
- originalTotalAmount는 할인 전 총액이며 앱의 총액 입력칸에 들어갈 값이다.
- totalAmount는 할인 후 최종 결제금액이며 검증과 분석 결과 표시에 사용한다.
- 명확한 합계, 총액, 결제금액, 받을금액, 청구금액이 있으면 우선 사용한다.
- 선결제, 미결제, 후결제, 잔액, 남은금액은 paymentInfo로 분리한다.
- 단, 명확한 총액이 없고 선결제/미결제가 하나의 주문 금액을 나누어 표시한 것으로 판단되면 두 금액의 합을 totalAmount 후보로 사용할 수 있다.
- 이 경우 totalAmountReason에 판단 근거를 반드시 적는다.
- 단순히 가장 큰 숫자나 마지막 숫자를 총액으로 고르지 않는다.

항목 추출 규칙:
- 실제 구매/이용 항목만 items에 넣는다.
- 단가, 수량, 금액이 함께 있으면 amount는 단가가 아니라 최종 금액 열을 사용한다.
- 단가만 있고 수량이 보이면 amount = 단가 × 수량으로 계산할 수 있다.
- 항목명이 줄바꿈되어도 하나의 상품/메뉴명으로 이어지면 병합한다.
- 금액이 없는 세트 구성품은 별도 항목으로 만들지 않는다.
- 배달비, 포장비, 봉사료, 자리세, 테이블 차지, 추가금/옵션 금액은 실제 결제 비용이면 항목으로 포함한다.
- 승인번호, 카드번호, 가맹점번호, 사업자번호, 전화번호, 주소, 날짜, 시간, 테이블번호, 주문번호, 거래번호, 영수증번호는 항목이나 총액으로 사용하지 않는다.
- 공급가액, 부가세, 과세, 면세 금액은 항목으로 만들지 않는다.

할인/쿠폰 규칙:
- 할인, 쿠폰, 포인트 사용, 멤버십, 프로모션, 서비스 차감, 즉시할인은 구매 항목으로 만들지 않고 discountInfo에 분리한다.
- 할인 금액이 명확하면 discountAmount에 기록한다.
- 할인율이 명확하면 discountPercent에 기록한다.
- 퍼센트 할인이더라도 실제 차감된 금액을 discountAmount에 반드시 기록한다.
- 여러 할인이 섞이면 discountType은 mixed로 한다.
- mixed 또는 unknown인 경우에도 전체 할인 금액은 discountAmount로 계산한다.

불확실성 처리:
- 일부 값이 불확실해도 가능한 후보를 반환하고 warnings에 설명한다.
- 영수증이 맞지만 일부가 흐리거나 잘렸으면 isReceipt=true로 두고 읽을 수 있는 값만 반환한다.
- 총액, 항목, 할인 결과가 논리적으로 불일치하면 계산을 막지 말고 warnings에 확인 필요 문구를 넣는다.`;
}

function isModelBusyMessage(message: string): boolean {
  const lowerMessage = message.toLowerCase();
  return (
    lowerMessage.includes("high demand") ||
    lowerMessage.includes("overloaded") ||
    lowerMessage.includes("unavailable") ||
    lowerMessage.includes("try again later") ||
    lowerMessage.includes("503")
  );
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "영수증 분석 중 오류가 발생했습니다.";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function callGeminiAnalysisWithBusyRetry(imageContent: string, mimeType: string): Promise<GeminiReceiptResponse> {
  try {
    return await callGeminiAnalysis(imageContent, mimeType);
  } catch (error) {
    const message = getErrorMessage(error);
    if (!isModelBusyMessage(message)) {
      throw error;
    }

    await sleep(2000);

    try {
      return await callGeminiAnalysis(imageContent, mimeType);
    } catch (retryError) {
      const retryMessage = getErrorMessage(retryError);
      if (isModelBusyMessage(retryMessage)) {
        throw new Error(MODEL_BUSY_MESSAGE);
      }
      throw retryError;
    }
  }
}

async function callGeminiAnalysis(imageContent: string, mimeType: string): Promise<GeminiReceiptResponse> {
  const apiKey = getEnvValue("GEMINI_API_KEY");
  const model = getModelName();
  const response = await fetch(`${GEMINI_API_BASE_URL}/${model}:generateContent?key=${apiKey}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            { text: buildReceiptAnalysisPrompt() },
            {
              inline_data: {
                mime_type: mimeType,
                data: imageContent,
              },
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.1,
        response_mime_type: "application/json",
      },
    }),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = data?.error?.message || `Gemini 영수증 분석 요청 실패: ${response.status}`;
    throw new Error(message);
  }

  const text = data?.candidates?.[0]?.content?.parts?.map((part: any) => part.text || "").join("\n").trim() || "";
  if (!text) {
    throw new Error("Gemini 분석 결과가 비어 있습니다.");
  }

  return parseGeminiJson(text);
}

function shouldRetry(raw: GeminiReceiptResponse): boolean {
  if (raw.isReceipt === false) return false;

  const items = Array.isArray(raw.items) ? raw.items : [];
  return safeNumber(raw.totalAmount) <= 0 && safeNumber(raw.originalTotalAmount) <= 0 && items.length === 0;
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("image") || formData.get("file");

    if (!(file instanceof File)) {
      return jsonResponse({ success: false, errorType: "NO_IMAGE", error: "영수증 이미지를 첨부해주세요." }, 400);
    }

    if (!isAllowedImageType(file.type)) {
      return jsonResponse(
        { success: false, errorType: "INVALID_FILE", error: "지원하지 않는 이미지 형식입니다. JPG, PNG, WEBP 형식의 영수증 이미지를 올려주세요." },
        400
      );
    }

    const maxFileSizeBytes = getMaxFileSizeBytes();
    if (file.size > maxFileSizeBytes) {
      return jsonResponse(
        { success: false, errorType: "FILE_TOO_LARGE", error: `이미지 용량이 너무 큽니다. ${Math.floor(maxFileSizeBytes / 1024 / 1024)}MB 이하의 영수증 이미지를 올려주세요.` },
        400
      );
    }

    const imageBuffer = Buffer.from(await file.arrayBuffer());
    const imageContent = imageBuffer.toString("base64");

    let raw = await callGeminiAnalysisWithBusyRetry(imageContent, file.type);

    if (raw.isReceipt === false) {
      return jsonResponse({ success: false, errorType: "NOT_RECEIPT", error: "영수증 사진을 올려주세요." }, 400);
    }

    if (shouldRetry(raw)) {
      raw = await callGeminiAnalysisWithBusyRetry(imageContent, file.type);
    }

    if (raw.isReceipt === false) {
      return jsonResponse({ success: false, errorType: "NOT_RECEIPT", error: "영수증 사진을 올려주세요." }, 400);
    }

    if (shouldRetry(raw)) {
      return jsonResponse(
        { success: false, errorType: "ANALYSIS_FAILED", error: "영수증 분석에 실패했습니다. 다시 촬영하거나 직접 입력해주세요." },
        422
      );
    }

    const normalized = normalizeGeminiResult(raw);
    return jsonResponse({ success: true, canApply: true, ...normalized });
  } catch (error) {
    const message = getErrorMessage(error);
    console.error("receipt-analysis error", message);

    if (message === MODEL_BUSY_MESSAGE || isModelBusyMessage(message)) {
      return jsonResponse({ success: false, errorType: "MODEL_BUSY", error: MODEL_BUSY_MESSAGE }, 503);
    }

    return jsonResponse({ success: false, errorType: "SERVER_ERROR", error: "영수증 분석 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요." }, 500);
  }
}
