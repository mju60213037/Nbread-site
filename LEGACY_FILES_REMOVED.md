# 레거시 파일 정리

이번 정리본에서는 현재 `dutch-pay-calculator.tsx` 통합 구조와 맞지 않는 예전 분리 컴포넌트를 제외했습니다.

제외한 파일:

- calculation-method-selector.tsx
- discount-options.tsx
- input-method-selector.tsx
- items-input.tsx
- receipt-input.tsx

이 파일들은 현재 `types.ts`의 최신 타입 구조(`CalculationMode`, `SplitItem` 등)와 맞지 않아 빌드 오류를 만들 수 있습니다. 현재 기능은 `dutch-pay-calculator.tsx`, `people-input.tsx`, `result-view.tsx`, `calculator.ts`, `types.ts`, `route.ts` 기준으로 유지했습니다.
