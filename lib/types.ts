export interface Person {
  id: string;
  name: string;
}

export type CalculationMode = "quick" | "detail";

export type SplitItemCategory =
  | "food"
  | "alcohol"
  | "drink"
  | "dessert"
  | "taxi"
  | "stay"
  | "karaoke"
  | "etc";

export type DetailSplitMode = "equal" | "quantity";

export interface DetailItemPortion {
  id: string;
  quantity: number;
  participantIds: string[];
}

export interface SplitItem {
  id: string;
  name: string;
  category: SplitItemCategory;
  amount: number;
  originalAmount?: number;
  discountApplied?: boolean;
  directPayerId: string;
  directCoveredAmount: number;
  splitMode: DetailSplitMode;

  // 균등 분할용
  participantIds: string[];

  // 먹은 양 분할용
  totalQuantity: number;
  quantityUnit: string;
  portions: DetailItemPortion[];
}

export interface QuickSupportDetail {
  id: string;
  payerId: string;
  payerName: string;
  amount: number;
}

export interface Transfer {
  fromId: string;
  fromName: string;
  toId: string;
  toName: string;
  amount: number;
}

export interface PersonBalance {
  id: string;
  name: string;
  isMainPayer: boolean;
  isSplitParticipant: boolean;
  coveredAmount: number;
  splitShareAmount: number;
  finalBurdenAmount: number;
  receiveAmount: number;
  sendAmount: number;
}

export interface ItemPortionCalculationDetail {
  id: string;
  quantity: number;
  participantCount: number;
  participantNames: string[];
  settlementAmount: number;
  baseShareAmount: number;
  remainder: number;
}

export interface ItemCalculationDetail {
  id: string;
  name: string;
  category: SplitItemCategory;
  splitMode: DetailSplitMode;
  originalAmount: number;
  discountAmount: number;
  settlementAmount: number;
  directPayerId?: string;
  directPayerName?: string;
  directCoveredAmount?: number;
  splitTargetAmount?: number;
  participantCount: number;
  baseShareAmount: number;
  remainder: number;
  participantNames: string[];
  totalQuantity?: number;
  quantityUnit?: string;
  portions?: ItemPortionCalculationDetail[];
}

export interface CalculationResult {
  mode: CalculationMode;
  totalAmount: number;
  discountAmount: number;
  settlementAmount: number;
  mainPayerId: string;
  mainPayerName: string;
  coveredPayerId?: string;
  coveredPayerName?: string;
  supportDetails?: QuickSupportDetail[];
  coveredAmount: number;
  remainingAmount: number;
  splitParticipantCount: number;
  baseSplitAmount: number;
  remainder: number;
  people: PersonBalance[];
  transfers: Transfer[];
  itemDetails?: ItemCalculationDetail[];
}
