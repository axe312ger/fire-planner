import type {
  AssetCategory,
  AssetMetadata,
  CsvTransaction,
  Position,
  PortfolioAnalysis,
} from '../types.js';
import { groupByIsin, monthlyInvestmentRate } from '../parsers/scalable-csv.js';
import { resolveIsins } from '../data/isin-resolver.js';
import { enrichWithJustEtf } from '../data/etf-scraper.js';
import { detectOverlaps } from './overlap.js';

/**
 * Categorize an asset based on its metadata.
 * @param csvAssetType - optional asset type from the CSV (e.g. "ETF", "EQUITY")
 */
export function categorizeAsset(isin: string, metadata: AssetMetadata, csvAssetType?: string): AssetCategory {
  if (metadata.category) return metadata.category;

  const name = (metadata.name ?? '').toLowerCase();
  let quoteType = (metadata.quoteType ?? '').toUpperCase();

  // Fall back to CSV asset type if Yahoo didn't provide a quote type
  if (!quoteType && csvAssetType) {
    quoteType = csvAssetType.toUpperCase();
  }

  // Commodities / ETCs
  if (
    quoteType === 'ETC' ||
    name.includes('gold') ||
    name.includes('silver') ||
    name.includes('commodity') ||
    name.includes('physical') ||
    name.includes('wisdomtree')
  ) {
    return 'commodity';
  }

  // Crypto
  if (name.includes('bitcoin') || name.includes('crypto') || name.includes('ethereum')) {
    return 'crypto';
  }

  // Individual stocks
  if (quoteType === 'EQUITY') {
    return 'individual-stock';
  }

  // ETFs
  if (quoteType === 'ETF' || quoteType === 'MUTUALFUND' || name.includes('etf') || name.includes('ucits')) {
    // Bond ETFs
    if (name.includes('bond') || name.includes('treasury') || name.includes('aggregate') || name.includes('fixed income')) {
      return 'bond-etf';
    }

    // Sector ETFs
    if (
      name.includes('technology') || name.includes('healthcare') || name.includes('clean energy') ||
      name.includes('semiconductor') || name.includes('cyber') || name.includes('gaming') ||
      name.includes('automation') || name.includes('artificial intelligence') ||
      name.includes('blockchain') || name.includes('water') || name.includes('cloud')
    ) {
      return 'sector-etf';
    }

    // Regional ETFs
    if (
      name.includes('europe') || name.includes('asia') || name.includes('emerging') ||
      name.includes('japan') || name.includes('china') || name.includes('africa') ||
      name.includes('india') || name.includes('latin') || name.includes('frontier') ||
      name.includes('pacific') || name.includes('euro stoxx') || name.includes('dax') ||
      name.includes('s&p 500') || name.includes('nasdaq') || name.includes('ftse 100')
    ) {
      return 'regional-etf';
    }

    // Global ETFs
    if (
      name.includes('world') || name.includes('global') || name.includes('all-world') ||
      name.includes('acwi') || name.includes('msci world') || name.includes('ftse all')
    ) {
      return 'global-etf';
    }

    // Default for unclassified ETFs
    return 'regional-etf';
  }

  return 'other';
}

/**
 * Determine region from metadata. Also checks the CSV description for keywords.
 */
export function determineRegion(metadata: AssetMetadata, csvDescription?: string): string {
  // Check both the API name and CSV description for region keywords
  const sources = [(metadata.name ?? ''), (csvDescription ?? '')];
  const name = sources.join(' ').toLowerCase();

  if (name.includes('world') || name.includes('global') || name.includes('acwi') || name.includes('all-world')) {
    return 'Global';
  }
  if (name.includes('s&p 500') || name.includes('nasdaq') || name.includes('us ') || name.includes('u.s.') || name.includes('america')) {
    return 'North America';
  }
  if (name.includes('europe') || name.includes('euro stoxx') || name.includes('dax') || name.includes('ftse 100')) {
    return 'Europe';
  }
  if (name.includes('emerging') || name.includes('em ')) {
    return 'Emerging Markets';
  }
  if (name.includes('africa')) return 'Africa';
  if (name.includes('asia') || name.includes('pacific') || name.includes('japan') || name.includes('china') || name.includes('india')) {
    return 'Asia-Pacific';
  }
  if (name.includes('latin')) return 'Latin America';

  return 'Other';
}

/**
 * Build a full portfolio analysis from CSV transactions.
 */
export async function analyzePortfolio(
  transactions: CsvTransaction[],
  refresh = false,
  onProgress?: (msg: string) => void,
): Promise<PortfolioAnalysis> {
  const byIsin = groupByIsin(transactions);
  const isins = Array.from(byIsin.keys());

  // Resolve ISINs via APIs
  onProgress?.(`Resolving ${isins.length} ISINs...`);
  const metadataMap = await resolveIsins(isins, refresh, (done, total) => {
    onProgress?.(`  Resolved ${done}/${total} ISINs`);
  });

  // Enrich ETFs with JustETF data
  onProgress?.('Enriching ETF data from JustETF...');
  for (const [isin, metadata] of metadataMap) {
    const enriched = await enrichWithJustEtf(isin, metadata, refresh);
    metadataMap.set(isin, enriched);
  }

  // Build positions
  const positions: Position[] = [];

  for (const [isin, txs] of byIsin) {
    const metadata = metadataMap.get(isin) ?? { name: isin };
    // Use CSV data as fallback for categorization
    const csvAssetType = txs[0]?.assetType;
    // Merge CSV description into metadata name for better classification
    const enrichedMetadata = {
      ...metadata,
      name: [metadata.name, txs[0]?.description].filter(Boolean).join(' — '),
    };
    const category = categorizeAsset(isin, enrichedMetadata, csvAssetType);

    const savingsPlans = txs.filter((t) => t.type === 'Savings plan');
    const totalShares = savingsPlans.reduce((sum, t) => sum + t.shares, 0);
    const totalInvested = savingsPlans.reduce((sum, t) => sum + Math.abs(t.amount), 0);
    const avgPrice = totalShares > 0 ? totalInvested / totalShares : 0;
    const currentPrice = metadata.currentPrice ?? avgPrice;
    const currentValue = totalShares * currentPrice;
    const monthly = monthlyInvestmentRate(txs);

    positions.push({
      isin,
      name: metadata.name ?? isin,
      totalShares,
      totalInvested,
      averagePrice: avgPrice,
      currentPrice,
      currentValue,
      monthlyInvestment: monthly,
      transactionCount: txs.length,
      category,
      metadata,
    });
  }

  // Category allocation
  const totalValue = positions.reduce((sum, p) => sum + p.currentValue, 0);
  const categoryAllocation: Record<string, { value: number; percent: number }> = {};
  for (const pos of positions) {
    const cat = pos.category;
    if (!categoryAllocation[cat]) {
      categoryAllocation[cat] = { value: 0, percent: 0 };
    }
    categoryAllocation[cat].value += pos.currentValue;
  }
  for (const cat of Object.keys(categoryAllocation)) {
    categoryAllocation[cat].percent = totalValue > 0 ? (categoryAllocation[cat].value / totalValue) * 100 : 0;
  }

  // Region allocation
  const regionAllocation: Record<string, { value: number; percent: number }> = {};
  for (const pos of positions) {
    // Use CSV description for region detection when API name is just a ticker
    const csvDescription = byIsin.get(pos.isin)?.[0]?.description;
    const region = determineRegion(pos.metadata ?? { name: pos.name }, csvDescription);
    if (!regionAllocation[region]) {
      regionAllocation[region] = { value: 0, percent: 0 };
    }
    regionAllocation[region].value += pos.currentValue;
  }
  for (const region of Object.keys(regionAllocation)) {
    regionAllocation[region].percent = totalValue > 0 ? (regionAllocation[region].value / totalValue) * 100 : 0;
  }

  // Overlap detection
  const overlaps = detectOverlaps(positions);

  // Concentration warnings
  const totalMonthly = positions.reduce((sum, p) => sum + p.monthlyInvestment, 0);
  const concentrationWarnings: string[] = [];
  for (const pos of positions) {
    if (totalMonthly > 0 && pos.monthlyInvestment / totalMonthly > 0.25) {
      const pct = ((pos.monthlyInvestment / totalMonthly) * 100).toFixed(1);
      concentrationWarnings.push(
        `${pos.name} (${pos.isin}): ${pct}% of monthly investment`,
      );
    }
    if (totalValue > 0 && pos.currentValue / totalValue > 0.25) {
      const pct = ((pos.currentValue / totalValue) * 100).toFixed(1);
      concentrationWarnings.push(
        `${pos.name} (${pos.isin}): ${pct}% of portfolio value`,
      );
    }
  }

  return {
    totalInvested: positions.reduce((sum, p) => sum + p.totalInvested, 0),
    totalCurrentValue: totalValue,
    totalMonthlyInvestment: totalMonthly,
    positionCount: positions.length,
    positions,
    categoryAllocation: categoryAllocation as any,
    regionAllocation: regionAllocation as any,
    overlaps,
    concentrationWarnings,
  };
}
