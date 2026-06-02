import type {
  EarningsCycle,
  EarningsMode,
  EarningsPayload,
  EarningsResult,
  LevelResult,
  LevelsPayload,
  ThesisCheck,
  ThesisInput,
} from '../types';


type ChartRecord = {
  timestamp: number;
  date: string;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number;
  volume: number | null;
};

type ChartPayload = {
  meta: Record<string, unknown>;
  records: ChartRecord[];
};

const chartBases = [
  'https://query1.finance.yahoo.com/v8/finance/chart',
  'https://query2.finance.yahoo.com/v8/finance/chart',
];

const earningsBases = [
  'https://www.historicalearnings.com',
];

const safeMean = (values: number[]) => {
  if (!values.length) {
    return null;
  }
  return values.reduce((total, value) => total + value, 0) / values.length;
};

const roundOrNull = (value: number | null | undefined, digits = 2) => {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return null;
  }
  return Number(value.toFixed(digits));
};

const pctChange = (current: number | null | undefined, reference: number | null | undefined) => {
  if (current === null || current === undefined || reference === null || reference === undefined || reference === 0) {
    return null;
  }
  return ((current / reference) - 1) * 100;
};

const nowIso = () => new Date().toISOString();

export const normalizeSymbols = (raw: string | string[]) => {
  const source = Array.isArray(raw) ? raw : raw.split(/[\s,]+/);
  const seen = new Set<string>();
  const cleaned: string[] = [];
  for (const item of source) {
    const value = item.trim().toUpperCase();
    if (!value || seen.has(value)) {
      continue;
    }
    seen.add(value);
    cleaned.push(value);
  }
  return cleaned;
};

async function fetchJsonWithFallback(urls: string[]) {
  let lastError = 'Unknown error';
  for (const url of urls) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        lastError = `${response.status} ${response.statusText}`;
        continue;
      }
      return await response.json();
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }
  throw new Error(lastError);
}

async function fetchTextWithFallback(urls: string[]) {
  let lastError = 'Unknown error';
  for (const url of urls) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        lastError = `${response.status} ${response.statusText}`;
        continue;
      }
      return await response.text();
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }
  throw new Error(lastError);
}

function buildRecords(result: Record<string, unknown>) {
  const timestamps = (result.timestamp as number[]) ?? [];
  const quoteSets = ((result.indicators as { quote?: Record<string, unknown>[] })?.quote ?? []);
  if (!quoteSets.length) {
    return [] as ChartRecord[];
  }

  const quotes = quoteSets[0];
  const opens = (quotes.open as Array<number | null>) ?? [];
  const highs = (quotes.high as Array<number | null>) ?? [];
  const lows = (quotes.low as Array<number | null>) ?? [];
  const closes = (quotes.close as Array<number | null>) ?? [];
  const volumes = (quotes.volume as Array<number | null>) ?? [];

  const records: ChartRecord[] = [];
  timestamps.forEach((timestamp, index) => {
    const close = closes[index];
    if (close === null || close === undefined) {
      return;
    }
    records.push({
      timestamp,
      date: new Date(timestamp * 1000).toISOString().slice(0, 10),
      open: opens[index] ?? null,
      high: highs[index] ?? close,
      low: lows[index] ?? close,
      close,
      volume: volumes[index] ?? null,
    });
  });
  return records;
}

async function fetchChart(symbol: string, rangeValue = '18mo'): Promise<ChartPayload> {
  const urls = chartBases.map((base) =>
    `${base}/${encodeURIComponent(symbol)}?interval=1d&range=${rangeValue}&includePrePost=false&events=div%2Csplits`,
  );
  const payload = await fetchJsonWithFallback(urls);
  const result = payload?.chart?.result?.[0];
  if (!result) {
    throw new Error(`No chart data for ${symbol}`);
  }
  const records = buildRecords(result);
  if (!records.length) {
    throw new Error(`No pricing history for ${symbol}`);
  }
  return {
    meta: result.meta ?? {},
    records,
  };
}

function movingAverage(values: number[], window: number) {
  if (values.length < window) {
    return null;
  }
  return safeMean(values.slice(-window));
}

function findPivots(records: ChartRecord[], field: 'high' | 'low', radius: number, mode: 'high' | 'low') {
  const points: number[] = [];
  for (let index = radius; index < records.length - radius; index += 1) {
    const center = records[index][field];
    if (center === null || center === undefined) {
      continue;
    }
    const neighbors: number[] = [];
    for (let neighbor = index - radius; neighbor <= index + radius; neighbor += 1) {
      if (neighbor === index) {
        continue;
      }
      const value = records[neighbor][field];
      if (value !== null && value !== undefined) {
        neighbors.push(value);
      }
    }
    if (!neighbors.length) {
      continue;
    }
    if (mode === 'low' && neighbors.every((value) => center <= value)) {
      points.push(center);
    }
    if (mode === 'high' && neighbors.every((value) => center >= value)) {
      points.push(center);
    }
  }
  return points;
}

function clusterLevels(levels: Array<number | null>, tolerancePct = 0.03) {
  const filtered = levels.filter((value): value is number => value !== null && value !== undefined && value > 0).sort((a, b) => a - b);
  if (!filtered.length) {
    return [] as number[];
  }
  const clusters: number[][] = [[filtered[0]]];
  filtered.slice(1).forEach((level) => {
    const anchor = safeMean(clusters[clusters.length - 1]) ?? clusters[clusters.length - 1][0];
    if (Math.abs(level - anchor) / anchor <= tolerancePct) {
      clusters[clusters.length - 1].push(level);
    } else {
      clusters.push([level]);
    }
  });
  return clusters.map((cluster) => roundOrNull(safeMean(cluster), 4) ?? cluster[cluster.length - 1]);
}

function nearestBelow(currentPrice: number, levels: number[], skip: number[] = []) {
  const blocked = new Set(skip);
  const candidates = levels.filter((level) => level < currentPrice && !blocked.has(level));
  return candidates.length ? Math.max(...candidates) : null;
}

function nearestAbove(currentPrice: number, levels: number[], skip: number[] = []) {
  const blocked = new Set(skip);
  const candidates = levels.filter((level) => level > currentPrice && !blocked.has(level));
  return candidates.length ? Math.min(...candidates) : null;
}

function buildThesisCheck(symbol: string, supportLevel: number, takeProfitLevel: number, thesis?: ThesisInput): ThesisCheck | null {
  if (!thesis || thesis.symbol.toUpperCase() !== symbol || !thesis.support || !thesis.takeProfit) {
    return null;
  }
  const supportGap = pctChange(thesis.support, supportLevel);
  const targetGap = pctChange(thesis.takeProfit, takeProfitLevel);
  const supportMatchesModel = Math.abs((thesis.support - supportLevel) / supportLevel) * 100 <= 6;
  const targetMatchesModel = Math.abs((thesis.takeProfit - takeProfitLevel) / takeProfitLevel) * 100 <= 6;
  return {
    symbol,
    supportGuess: thesis.support,
    takeProfitGuess: thesis.takeProfit,
    supportGapPct: roundOrNull(supportGap),
    targetGapPct: roundOrNull(targetGap),
    supportMatchesModel,
    targetMatchesModel,
  };
}

function computeLevels(symbol: string, chart: ChartPayload, thesis?: ThesisInput): LevelResult {
  const closes = chart.records.map((record) => record.close);
  const highs = chart.records.map((record) => record.high ?? record.close);
  const lows = chart.records.map((record) => record.low ?? record.close);
  const volumes = chart.records.map((record) => record.volume).filter((value): value is number => value !== null && value !== 0);

  const currentPrice = Number((chart.meta.regularMarketPrice as number | undefined) ?? closes[closes.length - 1]);
  const sma20 = movingAverage(closes, 20);
  const sma50 = movingAverage(closes, 50);
  const sma200 = movingAverage(closes, 200);
  const pivotLows = findPivots(chart.records.slice(-180), 'low', 3, 'low');
  const pivotHighs = findPivots(chart.records.slice(-180), 'high', 3, 'high');

  const supportCandidates = clusterLevels([
    ...pivotLows,
    lows.length >= 20 ? Math.min(...lows.slice(-20)) : null,
    lows.length >= 60 ? Math.min(...lows.slice(-60)) : null,
    lows.length >= 120 ? Math.min(...lows.slice(-120)) : null,
    sma20,
    sma50,
    sma200,
  ]);
  const resistanceCandidates = clusterLevels([
    ...pivotHighs,
    highs.length >= 20 ? Math.max(...highs.slice(-20)) : null,
    highs.length >= 60 ? Math.max(...highs.slice(-60)) : null,
    highs.length >= 120 ? Math.max(...highs.slice(-120)) : null,
    highs.length >= 252 ? Math.max(...highs.slice(-252)) : Math.max(...highs),
  ]);

  const supportLevel = nearestBelow(currentPrice, supportCandidates) ?? currentPrice * 0.93;
  const deepSupport = nearestBelow(currentPrice, supportCandidates, [supportLevel]) ?? supportLevel * 0.93;
  const takeProfitLevel = nearestAbove(currentPrice, resistanceCandidates) ?? Math.max(currentPrice * 1.1, currentPrice + (currentPrice - deepSupport));
  const stretchTarget = nearestAbove(currentPrice, resistanceCandidates, [takeProfitLevel]) ?? Math.max(
    currentPrice * 1.18,
    currentPrice + 2 * Math.max(currentPrice - supportLevel, 0.01),
  );

  const riskToSupportPct = pctChange(supportLevel, currentPrice);
  const rewardToTakeProfitPct = pctChange(takeProfitLevel, currentPrice);
  const rewardRiskRatio =
    riskToSupportPct !== null && rewardToTakeProfitPct !== null && Math.abs(riskToSupportPct) > 0
      ? rewardToTakeProfitPct / Math.abs(riskToSupportPct)
      : null;

  const volumeRatio =
    volumes.length >= 21 && safeMean(volumes.slice(-21, -1))
      ? volumes[volumes.length - 1] / (safeMean(volumes.slice(-21, -1)) ?? 1)
      : null;

  return {
    symbol,
    name: String(chart.meta.shortName ?? chart.meta.longName ?? symbol),
    price: roundOrNull(currentPrice),
    currency: String(chart.meta.currency ?? 'USD'),
    supportLevel: roundOrNull(supportLevel),
    deepSupport: roundOrNull(deepSupport),
    takeProfitLevel: roundOrNull(takeProfitLevel),
    stretchTarget: roundOrNull(stretchTarget),
    riskToSupportPct: roundOrNull(riskToSupportPct),
    rewardToTakeProfitPct: roundOrNull(rewardToTakeProfitPct),
    rewardRiskRatio: roundOrNull(rewardRiskRatio),
    volumeRatio: roundOrNull(volumeRatio),
    thesisCheck: buildThesisCheck(symbol, supportLevel, takeProfitLevel, thesis),
    lastCloseDate: chart.records[chart.records.length - 1].date,
  };
}

function parseMdyDate(value: string) {
  const [month, day, year] = value.trim().split('/').map((item) => Number(item));
  if (!month || !day || !year) {
    return null;
  }
  return new Date(Date.UTC(year, month - 1, day));
}

async function fetchHistoricalEarnings(symbol: string) {
  const urls = earningsBases.flatMap((base) => [
    `${base}/${symbol.toLowerCase()}.html`,
    `${base}/${symbol.toLowerCase()}-historical-earnings.html`,
  ]);
  const html = await fetchTextWithFallback(urls);
  const markerIndex = html.indexOf('Historical Earnings EPS');
  if (markerIndex === -1) {
    throw new Error(`Historical earnings table not found for ${symbol}`);
  }
  const tableStart = html.indexOf('<table', markerIndex);
  const tableEnd = html.indexOf('</table>', tableStart);
  if (tableStart === -1 || tableEnd === -1) {
    throw new Error(`Historical earnings rows not found for ${symbol}`);
  }
  const tableHtml = html.slice(tableStart, tableEnd);
  const rowPattern = /<tr><td[^>]*>([^<]+)<\/td><td[^>]*>([^<]+)<\/td><td[^>]*>([^<]+)<\/td><\/tr>/gi;
  const rows: { period: string; earningsDate: string; timestamp: number; eps: string }[] = [];

  let match = rowPattern.exec(tableHtml);
  while (match) {
    const parsed = parseMdyDate(match[2]);
    if (parsed) {
      rows.push({
        period: match[1].trim(),
        earningsDate: parsed.toISOString().slice(0, 10),
        timestamp: Math.floor(parsed.getTime() / 1000),
        eps: match[3].trim(),
      });
    }
    match = rowPattern.exec(tableHtml);
  }

  if (!rows.length) {
    throw new Error(`No historical earnings rows parsed for ${symbol}`);
  }

  const gaps: number[] = [];
  for (let index = 0; index < rows.length - 1; index += 1) {
    gaps.push((rows[index].timestamp - rows[index + 1].timestamp) / 86400);
  }
  const avgGap = gaps.length ? Math.round(gaps.slice(0, 4).reduce((total, value) => total + value, 0) / Math.min(gaps.length, 4)) : 90;
  const nextEstimate = new Date((rows[0].timestamp + avgGap * 86400) * 1000).toISOString().slice(0, 10);

  return {
    history: rows,
    nextEarningsDate: `~${nextEstimate}`,
    source: 'historicalearnings.com',
  };
}

function nearestRecordIndexOnOrBefore(records: ChartRecord[], eventTimestamp: number) {
  let chosen: number | null = null;
  records.forEach((record, index) => {
    if (record.timestamp <= eventTimestamp + 86400) {
      chosen = index;
    }
  });
  return chosen;
}

function buildEarningsCycle(
  records: ChartRecord[],
  eventTimestamp: number,
  preDays: number,
  postDays: number,
  nearLowPct: number,
  bouncePct: number,
  mode: EarningsMode,
): EarningsCycle | null {
  const eventIndex = nearestRecordIndexOnOrBefore(records, eventTimestamp);
  if (eventIndex === null || eventIndex < 10 || eventIndex >= records.length - 2) {
    return null;
  }

  const preSlice = records.slice(Math.max(0, eventIndex - preDays + 1), eventIndex + 1);
  const postSlice = records.slice(eventIndex + 1, Math.min(records.length, eventIndex + 1 + postDays));
  const minimumPostDays = Math.max(1, Math.min(3, postDays));
  if (preSlice.length < Math.min(12, Math.floor(preDays / 2)) || postSlice.length < minimumPostDays) {
    return null;
  }

  const preLow = Math.min(...preSlice.map((record) => record.low ?? record.close));
  const preAnchorClose = preSlice[0].close;
  const eventClose = preSlice[preSlice.length - 1].close;
  const postHigh = Math.max(...postSlice.map((record) => record.high ?? record.close));
  const postClose = postSlice[postSlice.length - 1].close;

  const lowGap = pctChange(eventClose, preLow);
  const preToEvent = pctChange(eventClose, preAnchorClose);
  const postHighReturn = pctChange(postHigh, eventClose);
  const postCloseReturn = pctChange(postClose, eventClose);
  const preToPostHigh = pctChange(postHigh, preAnchorClose);
  const preToPostClose = pctChange(postClose, preAnchorClose);

  if (lowGap === null || postHighReturn === null || postCloseReturn === null) {
    return null;
  }

  const qualified =
    mode === 'prepost'
      ? (preToPostClose ?? 0) >= bouncePct
      : lowGap <= nearLowPct && postHighReturn >= bouncePct;

  return {
    earningsDate: new Date(eventTimestamp * 1000).toISOString().slice(0, 10),
    preAnchorClose: roundOrNull(preAnchorClose),
    eventClose: roundOrNull(eventClose),
    twoMonthLow: roundOrNull(preLow),
    distanceFromTwoMonthLowPct: roundOrNull(lowGap),
    preToEventReturnPct: roundOrNull(preToEvent),
    postHighReturnPct: roundOrNull(postHighReturn),
    postCloseReturnPct: roundOrNull(postCloseReturn),
    preToPostHighReturnPct: roundOrNull(preToPostHigh),
    preToPostCloseReturnPct: roundOrNull(preToPostClose),
    qualified,
  };
}

async function scanEarningsPattern(
  symbol: string,
  preDays: number,
  postDays: number,
  nearLowPct: number,
  bouncePct: number,
  mode: EarningsMode,
): Promise<EarningsResult> {
  const [chart, historical] = await Promise.all([
    fetchChart(symbol, '2y'),
    fetchHistoricalEarnings(symbol),
  ]);

  const cycles = historical.history
    .map((item) => buildEarningsCycle(chart.records, item.timestamp, preDays, postDays, nearLowPct, bouncePct, mode))
    .filter((item): item is EarningsCycle => item !== null)
    .sort((a, b) => b.earningsDate.localeCompare(a.earningsDate));

  const qualifiedCycles = cycles.filter((cycle) => cycle.qualified);
  const hitRate = cycles.length ? (qualifiedCycles.length / cycles.length) * 100 : 0;

  const avgHigh =
    mode === 'prepost'
      ? safeMean(cycles.map((cycle) => cycle.preToPostHighReturnPct).filter((value): value is number => value !== null))
      : safeMean(cycles.map((cycle) => cycle.postHighReturnPct).filter((value): value is number => value !== null));
  const avgClose =
    mode === 'prepost'
      ? safeMean(cycles.map((cycle) => cycle.preToPostCloseReturnPct).filter((value): value is number => value !== null))
      : safeMean(cycles.map((cycle) => cycle.postCloseReturnPct).filter((value): value is number => value !== null));

  const currentPrice = Number((chart.meta.regularMarketPrice as number | undefined) ?? chart.records[chart.records.length - 1].close);

  return {
    symbol,
    name: String(chart.meta.shortName ?? chart.meta.longName ?? symbol),
    price: roundOrNull(currentPrice),
    currency: String(chart.meta.currency ?? 'USD'),
    nextEarningsDate: historical.nextEarningsDate,
    eventsTested: cycles.length,
    patternHits: qualifiedCycles.length,
    hitRatePct: roundOrNull(hitRate),
    avgPostHighReturnPct: roundOrNull(avgHigh),
    avgPostCloseReturnPct: roundOrNull(avgClose),
    latestCycle: cycles[0] ?? null,
    qualifyingCycles: qualifiedCycles.slice(0, 4),
    score: roundOrNull((hitRate / 100) * (avgHigh ?? 0) * Math.sqrt(Math.max(cycles.length, 1)), 4),
    historySource: historical.source,
    scanMode: mode,
  };
}

export async function getLevelsPayload({
  symbols,
  thesis,
}: {
  symbols: string[];
  thesis?: ThesisInput;
}): Promise<LevelsPayload> {
  const requested = normalizeSymbols(symbols);
  const results = await Promise.all(
    requested.map(async (symbol) => {
      try {
        const chart = await fetchChart(symbol, '18mo');
        return { ok: true as const, value: computeLevels(symbol, chart, thesis) };
      } catch (error) {
        return {
          ok: false as const,
          value: {
            symbol,
            error: error instanceof Error ? error.message : String(error),
          },
        };
      }
    }),
  );

  const levelResults: LevelResult[] = [];
  const errors: { symbol: string; error: string }[] = [];
  results.forEach((result) => {
    if (result.ok) {
      levelResults.push(result.value);
    } else {
      errors.push(result.value);
    }
  });

  levelResults.sort((a, b) => (b.rewardRiskRatio ?? -99) - (a.rewardRiskRatio ?? -99));

  return {
    results: levelResults,
    errors,
    lastUpdated: nowIso(),
  };
}

export async function getEarningsPayload({
  symbols,
  preDays,
  postDays,
  nearLowPct,
  bouncePct,
  mode,
}: {
  symbols: string[];
  preDays: number;
  postDays: number;
  nearLowPct: number;
  bouncePct: number;
  mode: EarningsMode;
}): Promise<EarningsPayload> {
  const requested = normalizeSymbols(symbols);
  const results = await Promise.all(
    requested.map(async (symbol) => {
      try {
        const scan = await scanEarningsPattern(symbol, preDays, postDays, nearLowPct, bouncePct, mode);
        return { ok: true as const, value: scan };
      } catch (error) {
        return {
          ok: false as const,
          value: {
            symbol,
            error: error instanceof Error ? error.message : String(error),
          },
        };
      }
    }),
  );

  const scans: EarningsResult[] = [];
  const errors: { symbol: string; error: string }[] = [];
  results.forEach((result) => {
    if (result.ok) {
      if (result.value.eventsTested > 0) {
        scans.push(result.value);
      }
    } else {
      errors.push(result.value);
    }
  });

  scans.sort((a, b) => {
    const left = [a.patternHits, a.hitRatePct ?? 0, a.avgPostHighReturnPct ?? 0];
    const right = [b.patternHits, b.hitRatePct ?? 0, b.avgPostHighReturnPct ?? 0];
    if (right[0] !== left[0]) {
      return right[0] - left[0];
    }
    if (right[1] !== left[1]) {
      return right[1] - left[1];
    }
    return right[2] - left[2];
  });

  return {
    results: scans,
    errors,
    filters: {
      preDays,
      postDays,
      nearLowPct,
      bouncePct,
      mode,
    },
    lastUpdated: nowIso(),
  };
}
