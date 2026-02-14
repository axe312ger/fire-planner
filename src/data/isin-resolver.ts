import type { AssetMetadata } from '../types.js';
import { cacheGet, cacheSet } from './cache.js';

/**
 * Resolve an ISIN to asset metadata.
 * Uses OpenFIGI (free, no auth needed) for ISIN → ticker/name/type mapping.
 * JustETF scraping fills in ETF-specific data (TER, dist/acc) separately.
 */
export async function resolveIsin(isin: string, refresh = false): Promise<AssetMetadata | null> {
  const cacheKey = `isin:${isin}`;

  if (!refresh) {
    const cached = cacheGet<AssetMetadata>(cacheKey);
    if (cached) return cached;
  }

  const metadata = await resolveViaOpenFigi(isin);
  if (metadata) {
    cacheSet(cacheKey, metadata);
    return metadata;
  }

  // Fallback: minimal metadata
  const minimal: AssetMetadata = { name: isin };
  cacheSet(cacheKey, minimal);
  return minimal;
}

/**
 * Use OpenFIGI free API to map ISIN → ticker, name, type.
 */
async function resolveViaOpenFigi(isin: string): Promise<AssetMetadata | null> {
  try {
    const response = await fetch('https://api.openfigi.com/v3/mapping', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify([{ idType: 'ID_ISIN', idValue: isin }]),
    });

    if (!response.ok) return null;
    const data = (await response.json()) as any[];
    const results = data?.[0]?.data;
    if (!results || results.length === 0) return null;

    // Prefer results from major European exchanges (XETRA, Euronext, LSE)
    const preferred = results.find((r: any) =>
      ['GY', 'GR', 'GF', 'NA', 'LN', 'IM', 'SM', 'FP', 'BB'].includes(r.exchCode),
    ) ?? results[0];

    const securityType = (preferred.securityType2 ?? preferred.securityType ?? '').toUpperCase();

    // Map OpenFIGI security types to our quoteType
    let quoteType: string | undefined;
    if (securityType.includes('ETP') || securityType.includes('OPEN-END FUND') || securityType.includes('ETF')) {
      quoteType = 'ETF';
    } else if (securityType.includes('COMMON STOCK') || securityType === 'COMMON_STOCK' || securityType.includes('SHARE')) {
      quoteType = 'EQUITY';
    } else if (securityType.includes('ETC') || securityType.includes('COMMODITY')) {
      quoteType = 'ETC';
    }

    return {
      name: preferred.name ?? isin,
      ticker: preferred.ticker,
      quoteType,
    };
  } catch {
    return null;
  }
}

/**
 * Batch-resolve multiple ISINs via OpenFIGI (up to 10 per request).
 */
async function batchResolveOpenFigi(isins: string[]): Promise<Map<string, AssetMetadata>> {
  const results = new Map<string, AssetMetadata>();
  const batchSize = 10; // OpenFIGI allows up to 10 per request without API key

  for (let i = 0; i < isins.length; i += batchSize) {
    const batch = isins.slice(i, i + batchSize);
    const body = batch.map((isin) => ({ idType: 'ID_ISIN', idValue: isin }));

    try {
      const response = await fetch('https://api.openfigi.com/v3/mapping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!response.ok) continue;
      const data = (await response.json()) as any[];

      for (let j = 0; j < batch.length; j++) {
        const isin = batch[j];
        const entry = data[j];
        if (entry?.data?.length > 0) {
          const preferred = entry.data.find((r: any) =>
            ['GY', 'GR', 'GF', 'NA', 'LN', 'IM', 'SM', 'FP', 'BB'].includes(r.exchCode),
          ) ?? entry.data[0];

          const securityType = (preferred.securityType2 ?? preferred.securityType ?? '').toUpperCase();
          let quoteType: string | undefined;
          if (securityType.includes('ETP') || securityType.includes('OPEN-END FUND') || securityType.includes('ETF')) {
            quoteType = 'ETF';
          } else if (securityType.includes('COMMON STOCK') || securityType === 'COMMON_STOCK' || securityType.includes('SHARE')) {
            quoteType = 'EQUITY';
          } else if (securityType.includes('ETC') || securityType.includes('COMMODITY')) {
            quoteType = 'ETC';
          }

          results.set(isin, {
            name: preferred.name ?? isin,
            ticker: preferred.ticker,
            quoteType,
          });
        }
      }

      // Respect rate limits: 6 requests/minute for unauthenticated
      if (i + batchSize < isins.length) {
        await new Promise((r) => setTimeout(r, 500));
      }
    } catch {
      // Continue with remaining batches
    }
  }

  return results;
}

/**
 * Resolve multiple ISINs with caching.
 */
export async function resolveIsins(
  isins: string[],
  refresh = false,
  onProgress?: (done: number, total: number) => void,
): Promise<Map<string, AssetMetadata>> {
  const results = new Map<string, AssetMetadata>();
  const toResolve: string[] = [];

  // Check cache first
  for (const isin of isins) {
    if (!refresh) {
      const cached = cacheGet<AssetMetadata>(`isin:${isin}`);
      if (cached) {
        results.set(isin, cached);
        continue;
      }
    }
    toResolve.push(isin);
  }

  if (toResolve.length > 0) {
    // Batch resolve uncached ISINs
    const resolved = await batchResolveOpenFigi(toResolve);

    for (const isin of toResolve) {
      const metadata = resolved.get(isin) ?? { name: isin };
      results.set(isin, metadata);
      cacheSet(`isin:${isin}`, metadata);
    }
  }

  onProgress?.(isins.length, isins.length);
  return results;
}
