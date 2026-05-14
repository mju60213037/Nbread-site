"use client";

import { ArrowLeft, Check, Copy, RotateCcw, Users } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { CalculationResult } from "@/lib/types";

interface ResultViewProps {
  result: CalculationResult;
  onEditPeople: () => void;
  onEditAmount: () => void;
  onReset: () => void;
}

export function ResultView({
  result,
  onEditPeople,
  onEditAmount,
  onReset,
}: ResultViewProps) {
  const [copied, setCopied] = useState(false);
  const [showCalculationDetail, setShowCalculationDetail] = useState(false);

  const getMainPayerLabel = () => `${result.mainPayerName}(대표 결제자)`;
  const supportDetails = result.supportDetails ?? [];
  const quickSupportText =
    supportDetails.length > 0
      ? supportDetails
          .map((support) => `${support.payerName}님 ${support.amount.toLocaleString()}원`)
          .join(", ")
      : "직접 부담 없음";

  const getNameWithRole = (id: string, name: string) =>
    id === result.mainPayerId ? `${name}(대표 결제자)` : name;

  const generateShareText = () => {
    const lines: string[] = [];

    lines.push("[n0.cal 정산 결과]");
    lines.push("");
    lines.push(`계산 방식: ${result.mode === "detail" ? "상세 계산" : "빠른 계산"}`);
    lines.push(`총 금액: ${result.totalAmount.toLocaleString()}원`);

    if (result.discountAmount > 0) {
      lines.push(`할인: ${result.discountAmount.toLocaleString()}원`);
    }

    lines.push(`정산 대상 금액: ${result.settlementAmount.toLocaleString()}원`);

    if (result.mode === "quick") {
      lines.push(`직접 부담/지원: ${quickSupportText}`);
      lines.push(`남은 금액: ${result.remainingAmount.toLocaleString()}원`);
      lines.push(`나눠 낼 사람: ${result.splitParticipantCount}명`);
    }

    if (result.mode === "detail" && result.itemDetails && result.itemDetails.length > 0) {
      lines.push(`항목 수: ${result.itemDetails.length}개`);
    }

    lines.push("");
    lines.push("해야 할 송금");

    if (result.transfers.length === 0) {
      lines.push("- 추가로 송금할 금액이 없습니다.");
    } else {
      result.transfers.forEach((transfer) => {
        lines.push(
          `- ${getNameWithRole(transfer.fromId, transfer.fromName)} → ${getNameWithRole(transfer.toId, transfer.toName)}: ${transfer.amount.toLocaleString()}원`
        );
      });
    }

    return lines.join("\n");
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(generateShareText());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = generateShareText();
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const renderQuickCalculationProcess = () => (
    <section className="bg-card border border-border rounded-2xl overflow-hidden">
      <div className="p-4 bg-muted/40 border-b border-border">
        <h3 className="font-semibold">계산 과정</h3>
        <p className="text-sm text-muted-foreground mt-1">
          빠른 계산에서 어떤 금액을 나눴는지 확인할 수 있어요.
        </p>
      </div>

      <div className="p-4 space-y-3 text-sm">
        <div className="space-y-2">
          <div className="flex justify-between gap-3">
            <span className="text-muted-foreground">총 금액</span>
            <span className="font-medium">{result.totalAmount.toLocaleString()}원</span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-muted-foreground">할인 금액</span>
            <span className="font-medium">-{result.discountAmount.toLocaleString()}원</span>
          </div>
          <div className="flex justify-between gap-3 pt-2 border-t border-border">
            <span className="text-muted-foreground">정산 대상 금액</span>
            <span className="font-semibold">{result.settlementAmount.toLocaleString()}원</span>
          </div>
        </div>

        <div className="rounded-xl bg-muted/40 p-3 space-y-2">
          {supportDetails.length > 0 ? (
            <div className="space-y-1">
              <p>먼저 부담하기로 한 금액이 있어요.</p>
              {supportDetails.map((support) => (
                <p key={support.id} className="text-muted-foreground">
                  {support.payerName}님이 {support.amount.toLocaleString()}원을 지원했어요.
                </p>
              ))}
            </div>
          ) : (
            <p>직접 부담/지원금 없이 정산 대상 금액 전체를 나눠요.</p>
          )}
          <p>
            남은 {result.remainingAmount.toLocaleString()}원을 {result.splitParticipantCount}명이 나눠 냅니다.
          </p>
          {result.splitParticipantCount > 0 && (
            <p className="text-muted-foreground">
              기본 1인 부담은 {result.baseSplitAmount.toLocaleString()}원
              {result.remainder > 0 ? `이고, ${result.remainder}명은 1원씩 더 부담해요.` : "입니다."}
            </p>
          )}
        </div>
      </div>
    </section>
  );

  const renderDetailCalculationProcess = () => {
    if (!result.itemDetails || result.itemDetails.length === 0) return null;

    const totalDirectCoveredAmount = result.itemDetails.reduce(
      (sum, item) => sum + (item.directCoveredAmount ?? 0),
      0
    );
    const totalSplitTargetAmount = result.itemDetails.reduce(
      (sum, item) => sum + (item.splitTargetAmount ?? item.settlementAmount),
      0
    );

    return (
      <section className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="p-4 bg-muted/40 border-b border-border">
          <h3 className="font-semibold">계산 과정</h3>
          <p className="text-sm text-muted-foreground mt-1">
            항목별로 지원금과 나눌 금액이 어떻게 계산됐는지 확인할 수 있어요.
          </p>
        </div>

        <div className="p-4 space-y-4">
          <div className="rounded-xl bg-muted/40 p-3 space-y-2 text-sm">
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground">총 금액</span>
              <span className="font-medium">{result.totalAmount.toLocaleString()}원</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground">할인 금액</span>
              <span className="font-medium">-{result.discountAmount.toLocaleString()}원</span>
            </div>
            <div className="flex justify-between gap-3 pt-2 border-t border-border">
              <span className="text-muted-foreground">정산 대상 금액</span>
              <span className="font-semibold">{result.settlementAmount.toLocaleString()}원</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground">지원 금액 합계</span>
              <span className="font-medium">{totalDirectCoveredAmount.toLocaleString()}원</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground">항목에서 나눌 금액 합계</span>
              <span className="font-medium">{totalSplitTargetAmount.toLocaleString()}원</span>
            </div>
          </div>

          <div className="space-y-3">
            {result.itemDetails.map((item) => {
              const splitTargetAmount = item.splitTargetAmount ?? item.settlementAmount;
              const hasDirectSupport = item.directPayerName && item.directCoveredAmount > 0;

              return (
                <div key={item.id} className="rounded-2xl border border-border bg-background p-4 space-y-3">
                  <div className="flex justify-between gap-3">
                    <div>
                      <p className="font-semibold">{item.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {item.splitMode === "equal" ? "다 같이 똑같이" : "먹은 양이 달라요"}
                      </p>
                    </div>
                    <p className="font-semibold whitespace-nowrap">{item.originalAmount.toLocaleString()}원</p>
                  </div>

                  <div className="space-y-1 text-sm">
                    {item.discountAmount > 0 && (
                      <p className="text-muted-foreground">
                        할인 반영: -{item.discountAmount.toLocaleString()}원
                      </p>
                    )}

                    {hasDirectSupport ? (
                      <p>
                        {item.directPayerName}님이 {item.directCoveredAmount.toLocaleString()}원을 지원했어요.
                      </p>
                    ) : (
                      <p className="text-muted-foreground">지원 금액은 없어요.</p>
                    )}

                    <p>
                      나머지 {splitTargetAmount.toLocaleString()}원을 {item.participantNames.join(", ") || "선택된 참여자"} 기준으로 나눠요.
                    </p>
                  </div>

                  {item.splitMode === "equal" ? (
                    <div className="rounded-xl bg-muted/40 p-3 text-sm space-y-1">
                      <p>
                        {item.participantCount}명이 같은 금액으로 부담합니다.
                      </p>
                      {item.participantCount > 0 && (
                        <p className="text-muted-foreground">
                          기본 1인 부담은 {item.baseShareAmount.toLocaleString()}원
                          {item.remainder > 0 ? `이고, ${item.remainder}명은 1원씩 더 부담해요.` : "입니다."}
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="rounded-xl bg-muted/40 p-3 text-sm space-y-2">
                      <p>
                        총 {item.totalQuantity?.toLocaleString() ?? 0} {item.quantityUnit ?? "단위"} 기준으로 나눴어요.
                      </p>
                      {item.portions && item.portions.length > 0 && (
                        <div className="space-y-1 text-muted-foreground">
                          {item.portions.map((portion, index) => (
                            <p key={portion.id}>
                              {index + 1}. {portion.quantity.toLocaleString()} {item.quantityUnit ?? "단위"} → {portion.participantNames.join(", ") || "참여자 없음"} / {portion.settlementAmount.toLocaleString()}원
                            </p>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>
    );
  };

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-bold text-foreground">정산 결과</h2>
        {result.mode === "quick" ? (
          <>
            <p className="text-muted-foreground">
              총 {result.totalAmount.toLocaleString()}원에서 할인 {result.discountAmount.toLocaleString()}원을 뺐어요. {supportDetails.length > 0 ? `${quickSupportText}을 먼저 부담했어요.` : "직접 부담 없이 계산했어요."}
            </p>
            <p className="text-sm text-muted-foreground">
              남은 {result.remainingAmount.toLocaleString()}원을 {result.splitParticipantCount}명이 나눠 냅니다.
            </p>
          </>
        ) : (
          <>
            <p className="text-muted-foreground">
              항목별 입력을 기준으로 계산했어요. 총 {result.totalAmount.toLocaleString()}원에서 할인 {result.discountAmount.toLocaleString()}원을 뺀 {result.settlementAmount.toLocaleString()}원을 정산합니다.
            </p>
            <p className="text-sm text-muted-foreground">
              최종 송금은 {getMainPayerLabel()}님에게 모이도록 정리했어요.
            </p>
          </>
        )}
        {result.remainder > 0 && (
          <p className="text-xs text-muted-foreground">
            1원 단위로 맞추기 위해 일부 참여자가 1원씩 더 부담할 수 있어요.
          </p>
        )}
      </div>

      <section className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="p-4 bg-primary/5 border-b border-border">
          <h3 className="font-semibold">해야 할 송금</h3>
          <p className="text-sm text-muted-foreground mt-1">
            아래 금액만 보내면 정산이 끝나요.
          </p>
        </div>

        <div className="divide-y divide-border">
          {result.transfers.length === 0 ? (
            <div className="p-5 text-center text-muted-foreground">
              추가로 송금할 금액이 없습니다.
            </div>
          ) : (
            result.transfers.map((transfer) => {
              const isToMainPayer = transfer.toId === result.mainPayerId;

              return (
                <div key={`${transfer.fromId}-${transfer.toId}`} className="p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p className="font-medium">
                        {getNameWithRole(transfer.fromId, transfer.fromName)} → {transfer.toName}
                        {isToMainPayer && (
                          <span
                            className="ml-1 inline-flex items-center justify-center rounded-full font-semibold align-middle"
                            style={{
                              backgroundColor: "#dbeafe",
                              color: "#2563eb",
                              fontSize: "11px",
                              lineHeight: "1",
                              minHeight: "18px",
                              padding: "0 6px",
                              verticalAlign: "middle",
                            }}
                          >
                            대표 결제자
                          </span>
                        )}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {transfer.fromName}님이 {getNameWithRole(transfer.toId, transfer.toName)}님에게 보내기
                      </p>
                    </div>
                    <p className="text-lg font-bold whitespace-nowrap">
                      {transfer.amount.toLocaleString()}원
                    </p>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>

      <section className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="p-4 bg-muted/40 border-b border-border">
          <h3 className="font-semibold">사람별 내역</h3>
        </div>

        <div className="divide-y divide-border">
          {result.people.map((person) => (
            <div key={person.id} className="p-4 space-y-2">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium">
                    {person.name}
                    {person.isMainPayer && (
                      <span className="ml-2 text-xs bg-primary/10 text-primary px-2 py-1 rounded-full">
                        대표 결제자
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    최종 부담: {person.finalBurdenAmount.toLocaleString()}원
                  </p>
                </div>
                <p
                  className={
                    person.receiveAmount > 0
                      ? "font-semibold text-primary whitespace-nowrap"
                      : person.sendAmount > 0
                        ? "font-semibold text-destructive whitespace-nowrap"
                        : "font-semibold text-muted-foreground whitespace-nowrap"
                  }
                >
                  {person.receiveAmount > 0
                    ? `${person.receiveAmount.toLocaleString()}원 받음`
                    : person.sendAmount > 0
                      ? `${person.sendAmount.toLocaleString()}원 보내기`
                      : "송금 없음"}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm text-muted-foreground">
                <p>직접 부담: {person.coveredAmount.toLocaleString()}원</p>
                <p>나눠 낼 금액: {person.splitShareAmount.toLocaleString()}원</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="space-y-3">
        <Button
          type="button"
          variant="outline"
          onClick={() => setShowCalculationDetail((current) => !current)}
          className="w-full h-12"
        >
          {showCalculationDetail ? "계산 과정 숨기기" : "계산 과정 확인"}
        </Button>

        {showCalculationDetail &&
          (result.mode === "quick" ? renderQuickCalculationProcess() : renderDetailCalculationProcess())}
      </div>

      <section className="p-4 bg-muted/50 rounded-2xl space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">총 금액</span>
          <span className="font-medium">{result.totalAmount.toLocaleString()}원</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">할인 금액</span>
          <span className="font-medium">-{result.discountAmount.toLocaleString()}원</span>
        </div>
        <div className="flex justify-between pt-2 border-t border-border">
          <span className="text-muted-foreground">정산 대상 금액</span>
          <span className="font-semibold">{result.settlementAmount.toLocaleString()}원</span>
        </div>
        {result.mode === "quick" && (
          <>
            <div className="flex justify-between">
              <span className="text-muted-foreground">직접 부담/지원금</span>
              <span className="font-medium">-{result.coveredAmount.toLocaleString()}원</span>
            </div>
            <div className="flex justify-between pt-2 border-t border-border">
              <span className="text-muted-foreground">남은 금액</span>
              <span className="font-semibold">{result.remainingAmount.toLocaleString()}원</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">기본 1인 부담</span>
              <span className="font-medium">
                {result.baseSplitAmount.toLocaleString()}원
                {result.remainder > 0 && ` + 일부 1원`}
              </span>
            </div>
          </>
        )}
      </section>

      <div className="grid grid-cols-2 gap-3">
        <Button variant="outline" onClick={handleCopy} className="h-12">
          {copied ? (
            <>
              <Check className="w-4 h-4 mr-2" />
              복사됨
            </>
          ) : (
            <>
              <Copy className="w-4 h-4 mr-2" />
              결과 복사
            </>
          )}
        </Button>
        <Button variant="outline" onClick={onEditAmount} className="h-12">
          <ArrowLeft className="w-4 h-4 mr-2" />
          이전
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Button variant="outline" onClick={onEditPeople} className="h-12">
          <Users className="w-4 h-4 mr-2" />
          참여자 수정
        </Button>
        <Button variant="outline" onClick={onReset} className="h-12">
          <RotateCcw className="w-4 h-4 mr-2" />
          다시 계산
        </Button>
      </div>
    </div>
  );
}
