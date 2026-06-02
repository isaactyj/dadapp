export type EarningsMode = 'prepost';

export type Preset = {
  id: string;
  name: string;
  description: string;
  symbols: string[];
};

export type ThesisInput = {
  symbol: string;
  support: number;
  takeProfit: number;
};

export type ThesisCheck = {
  symbol: string;
  supportGuess: number;
  takeProfitGuess: number;
  supportGapPct: number | null;
  targetGapPct: number | null;
  supportMatchesModel: boolean;
  targetMatchesModel: boolean;
};

export type LevelResult = {
  symbol: string;
  name: string;
  price: number | null;
  currency: string;
  supportLevel: number | null;
  deepSupport: number | null;
  takeProfitLevel: number | null;
  stretchTarget: number | null;
  riskToSupportPct: number | null;
  rewardToTakeProfitPct: number | null;
  rewardRiskRatio: number | null;
  volumeRatio: number | null;
  thesisCheck: ThesisCheck | null;
  lastCloseDate: string;
};

export type LevelsPayload = {
  results: LevelResult[];
  errors: { symbol: string; error: string }[];
  lastUpdated: string;
};

export type EarningsCycle = {
  earningsDate: string;
  preAnchorClose: number | null;
  eventClose: number | null;
  twoMonthLow: number | null;
  distanceFromTwoMonthLowPct: number | null;
  preToEventReturnPct: number | null;
  postHighReturnPct: number | null;
  postCloseReturnPct: number | null;
  preToPostHighReturnPct: number | null;
  preToPostCloseReturnPct: number | null;
  qualified: boolean;
};

export type EarningsResult = {
  symbol: string;
  name: string;
  price: number | null;
  currency: string;
  nextEarningsDate: string | null;
  eventsTested: number;
  patternHits: number;
  hitRatePct: number | null;
  avgPostHighReturnPct: number | null;
  avgPostCloseReturnPct: number | null;
  latestCycle: EarningsCycle | null;
  qualifyingCycles: EarningsCycle[];
  score: number | null;
  historySource: string;
  scanMode: EarningsMode;
};

export type EarningsPayload = {
  results: EarningsResult[];
  errors: { symbol: string; error: string }[];
  filters: {
    preDays: number;
    postDays: number;
    mode: EarningsMode;
  };
  lastUpdated: string;
};
