import * as cheerio from 'cheerio';
import type { AssetMetadata } from '../types.js';
import { cacheGet, cacheSet } from './cache.js';

const JUSTETF_BASE = 'https://www.justetf.com/en/etf-profile.html';

/**
 * Scrape JustETF for ETF-specific data: TER, distribution type, country allocation.
 * Only works for UCITS ETFs with an ISIN.
 */
export async function scrapeJustEtf(
  isin: string,
  refresh = false,
): Promise<Partial<AssetMetadata> | null> {
  const cacheKey = `justetf:${isin}`;

  if (!refresh) {
    const cached = cacheGet<Partial<AssetMetadata>>(cacheKey);
    if (cached) return cached;
  }

  try {
    const url = `${JUSTETF_BASE}?isin=${isin}`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; fire-planner/1.0)',
        Accept: 'text/html',
      },
    });

    if (!response.ok) return null;

    const html = await response.text();
    const $ = cheerio.load(html);

    const result: Partial<AssetMetadata> = {};

    // TER — look for "Total expense ratio" in the overview table
    $('td, th, div').each((_, el) => {
      const text = $(el).text().trim();
      if (text.includes('Total expense ratio') || text.includes('TER')) {
        const next = $(el).next();
        const terText = next.text().trim();
        const match = terText.match(/([\d,.]+)\s*%/);
        if (match) {
          result.ter = parseFloat(match[1].replace(',', '.')) / 100;
        }
      }
    });

    // Distribution type
    const pageText = $.text();
    if (/\baccumulating\b/i.test(pageText)) {
      result.distributionType = 'accumulating';
    } else if (/\bdistributing\b/i.test(pageText)) {
      result.distributionType = 'distributing';
    }

    // Country allocation — look for country table
    const countryAllocation: Record<string, number> = {};
    $('table').each((_, table) => {
      const rows = $(table).find('tr');
      let isCountryTable = false;
      rows.each((_, row) => {
        const cells = $(row).find('td, th');
        const headerText = cells.first().text().trim().toLowerCase();
        if (headerText.includes('country') || headerText.includes('countries')) {
          isCountryTable = true;
          return;
        }
        if (isCountryTable && cells.length >= 2) {
          const country = cells.first().text().trim();
          const weightText = cells.last().text().trim();
          const match = weightText.match(/([\d,.]+)\s*%/);
          if (country && match) {
            countryAllocation[country] = parseFloat(match[1].replace(',', '.'));
          }
        }
      });
    });

    if (Object.keys(countryAllocation).length > 0) {
      result.countryAllocation = countryAllocation;
    }

    cacheSet(cacheKey, result);
    return result;
  } catch {
    return null;
  }
}

/**
 * Enrich metadata with JustETF data for ETFs.
 */
export async function enrichWithJustEtf(
  isin: string,
  existing: AssetMetadata,
  refresh = false,
): Promise<AssetMetadata> {
  // Only scrape for ETFs
  if (existing.quoteType && existing.quoteType !== 'ETF' && existing.quoteType !== 'MUTUALFUND') {
    return existing;
  }

  const scraped = await scrapeJustEtf(isin, refresh);
  if (!scraped) return existing;

  return {
    ...existing,
    ter: existing.ter ?? scraped.ter,
    distributionType: existing.distributionType ?? scraped.distributionType,
    countryAllocation: existing.countryAllocation ?? scraped.countryAllocation,
  };
}
