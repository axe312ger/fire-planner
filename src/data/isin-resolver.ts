import yahooFinance from 'yahoo-finance2';
import type { AssetMetadata, Holding } from '../types.js';
import { cacheGet, cacheSet } from './cache.js';

/**
 * Resolve an ISIN to asset metadata using Yahoo Finance.
 * Falls back to OpenFIGI if Yahoo can't find the ticker.
 */
export async function resolveIsin(isin: string, refresh = false): Promise<AssetMetadata | null> {
  const cacheKey = `isin:${isin}`;

  if (!refresh) {
    const cached = cacheGet<AssetMetadata>(cacheKey);
    if (cached) return cached;
  }

  // Step 1: Search Yahoo Finance for the ISIN
  let ticker: string | null = null;
  try {
    const results = await yahooFinance.search(isin, { quotesCount: 5 });
    const quote = results.quotes?.find(
      (q: any) => q.symbol && (q.quoteType === 'ETF' || q.quoteType === 'EQUITY' || q.quoteType === 'MUTUALFUND'),
    ) ?? results.quotes?.[0];

    if (quote?.symbol) {
      ticker = quote.symbol;
    }
  } catch {
    // Yahoo search failed, try OpenFIGI
  }

  // Step 2: Fallback to OpenFIGI
  if (!ticker) {
    ticker = await resolveViaOpenFigi(isin);
  }

  if (!ticker) {
    // Can't resolve — return minimal metadata
    const minimal: AssetMetadata = { name: isin };
    cacheSet(cacheKey, minimal);
    return minimal;
  }

  // Step 3: Get quote summary from Yahoo
  try {
    const summary = await yahooFinance.quoteSummary(ticker, {
      modules: ['price', 'summaryProfile', 'topHoldings', 'fundProfile', 'defaultKeyStatistics'],
    });

    const topHoldings: Holding[] = (summary.topHoldings?.holdings ?? []).map((h: any) => ({
      name: h.holdingName ?? h.symbol ?? 'Unknown',
      weight: (h.holdingPercent ?? 0) * 100,
    }));

    const sectorWeightings: Record<string, number> = {};
    if (summary.topHoldings?.sectorWeightings) {
      for (const sector of summary.topHoldings.sectorWeightings) {
        for (const [key, value] of Object.entries(sector)) {
          if (typeof value === 'number') {
            sectorWeightings[key] = value * 100;
          }
        }
      }
    }

    const metadata: AssetMetadata = {
      name: summary.price?.longName ?? summary.price?.shortName ?? ticker,
      ticker,
      quoteType: summary.price?.quoteType,
      currentPrice: summary.price?.regularMarketPrice,
      currency: summary.price?.currency,
      ter: summary.fundProfile?.feesExpensesInvestment?.annualReportExpenseRatio
        ?? summary.defaultKeyStatistics?.annualReportExpenseRatio
        ?? undefined,
      topHoldings: topHoldings.length > 0 ? topHoldings : undefined,
      sectorWeightings: Object.keys(sectorWeightings).length > 0 ? sectorWeightings : undefined,
    };

    cacheSet(cacheKey, metadata);
    return metadata;
  } catch {
    const minimal: AssetMetadata = { name: ticker, ticker };
    cacheSet(cacheKey, minimal);
    return minimal;
  }
}

/**
 * Use OpenFIGI free API to map ISIN → ticker.
 */
async function resolveViaOpenFigi(isin: string): Promise<string | null> {
  try {
    const response = await fetch('https://api.openfigi.com/v3/mapping', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify([{ idType: 'ID_ISIN', idValue: isin }]),
    });

    if (!response.ok) return null;
    const data = (await response.json()) as any[];
    const firstResult = data?.[0]?.data?.[0];
    return firstResult?.ticker ?? null;
  } catch {
    return null;
  }
}

/**
 * Resolve multiple ISINs concurrently with rate limiting.
 */
export async function resolveIsins(
  isins: string[],
  refresh = false,
  onProgress?: (done: number, total: number) => void,
): Promise<Map<string, AssetMetadata>> {
  const results = new Map<string, AssetMetadata>();
  let done = 0;

  for (const isin of isins) {
    const metadata = await resolveIsin(isin, refresh);
    if (metadata) {
      results.set(isin, metadata);
    }
    done++;
    onProgress?.(done, isins.length);

    // Small delay to be respectful of APIs
    if (done < isins.length) {
      await new Promise((r) => setTimeout(r, 300));
    }
  }

  return results;
}
