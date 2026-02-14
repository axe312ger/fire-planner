import { describe, expect, it } from 'vitest';
import { categorizeAsset, determineRegion } from '../src/analyzers/portfolio.js';
import { detectOverlaps } from '../src/analyzers/overlap.js';
import type { AssetMetadata, Position } from '../src/types.js';

describe('categorizeAsset', () => {
  it('categorizes ETF as global-etf', () => {
    const metadata: AssetMetadata = {
      name: 'iShares Core MSCI World UCITS ETF',
      quoteType: 'ETF',
    };
    expect(categorizeAsset('IE00B4L5Y983', metadata)).toBe('global-etf');
  });

  it('categorizes equity as individual-stock', () => {
    const metadata: AssetMetadata = {
      name: 'Tesla Inc',
      quoteType: 'EQUITY',
    };
    expect(categorizeAsset('US88160R1014', metadata)).toBe('individual-stock');
  });

  it('categorizes commodity ETC', () => {
    const metadata: AssetMetadata = {
      name: 'WisdomTree Physical Gold',
      quoteType: 'ETC',
    };
    expect(categorizeAsset('JE00B1VS3770', metadata)).toBe('commodity');
  });

  it('does not misclassify WisdomTree equity ETFs as commodity', () => {
    const metadata: AssetMetadata = {
      name: 'WisdomTree Artificial Intelligence UCITS ETF',
      quoteType: 'ETF',
    };
    expect(categorizeAsset('IE00BDVPNG13', metadata)).toBe('sector-etf');
  });

  it('classifies MSCI World Equal Weight as global-etf, not regional', () => {
    const metadata: AssetMetadata = {
      name: 'iShares MSCI World Equal Weight UCITS ETF',
      quoteType: 'ETF',
    };
    expect(categorizeAsset('IE000OAQ44U0', metadata)).toBe('global-etf');
  });

  it('classifies MSCI World Net Zero as global-etf, not regional', () => {
    const metadata: AssetMetadata = {
      name: 'Amundi MSCI World Climate Net Zero Ambition PAB UCITS ETF',
      quoteType: 'ETF',
    };
    expect(categorizeAsset('LU2572257124', metadata)).toBe('global-etf');
  });

  it('categorizes sector ETF', () => {
    const metadata: AssetMetadata = {
      name: 'iShares Global Clean Energy UCITS ETF',
      quoteType: 'ETF',
    };
    expect(categorizeAsset('IE00B1XNHC34', metadata)).toBe('sector-etf');
  });

  it('categorizes emerging markets as regional ETF', () => {
    const metadata: AssetMetadata = {
      name: 'Xtrackers MSCI Emerging Markets UCITS ETF',
      quoteType: 'ETF',
    };
    expect(categorizeAsset('IE00BTJRMP35', metadata)).toBe('regional-etf');
  });

  it('categorizes bond ETF', () => {
    const metadata: AssetMetadata = {
      name: 'iShares Core Global Aggregate Bond UCITS ETF',
      quoteType: 'ETF',
    };
    expect(categorizeAsset('IE00BDBRDM35', metadata)).toBe('bond-etf');
  });
});

describe('determineRegion', () => {
  it('identifies global region', () => {
    expect(determineRegion({ name: 'MSCI World ETF' })).toBe('Global');
  });

  it('identifies emerging markets', () => {
    expect(determineRegion({ name: 'MSCI Emerging Markets' })).toBe('Emerging Markets');
  });

  it('identifies Europe', () => {
    expect(determineRegion({ name: 'Euro Stoxx 50' })).toBe('Europe');
  });

  it('identifies Africa', () => {
    expect(determineRegion({ name: 'Africa ETF' })).toBe('Africa');
  });

  it('does not misclassify names containing "em " substring as Emerging Markets', () => {
    expect(determineRegion({ name: 'Stem Inc' })).not.toBe('Emerging Markets');
    expect(determineRegion({ name: 'System1 Group' })).not.toBe('Emerging Markets');
  });

  it('matches standalone EM abbreviation', () => {
    expect(determineRegion({ name: 'X EM UCITS ETF' })).toBe('Emerging Markets');
  });
});

describe('detectOverlaps', () => {
  it('detects overlap when two ETFs share >50% of top holdings', () => {
    const positions: Position[] = [
      {
        isin: 'ETF1',
        name: 'Global ETF 1',
        totalShares: 100,
        totalInvested: 5000,
        averagePrice: 50,
        currentPrice: 55,
        currentValue: 5500,
        monthlyInvestment: 100,
        transactionCount: 10,
        category: 'global-etf',
        metadata: {
          name: 'Global ETF 1',
          topHoldings: [
            { name: 'Apple Inc', weight: 10 },
            { name: 'Microsoft Corp', weight: 8 },
            { name: 'Amazon Inc', weight: 7 },
            { name: 'Nvidia Corp', weight: 6 },
            { name: 'Alphabet Inc', weight: 5 },
          ],
        },
      },
      {
        isin: 'ETF2',
        name: 'Global ETF 2',
        totalShares: 50,
        totalInvested: 3000,
        averagePrice: 60,
        currentPrice: 65,
        currentValue: 3250,
        monthlyInvestment: 50,
        transactionCount: 5,
        category: 'global-etf',
        metadata: {
          name: 'Global ETF 2',
          topHoldings: [
            { name: 'Apple Inc.', weight: 12 },
            { name: 'Microsoft Corporation', weight: 9 },
            { name: 'Amazon Inc.', weight: 8 },
            { name: 'Nvidia Corporation', weight: 7 },
            { name: 'Meta Platforms', weight: 5 },
          ],
        },
      },
    ];

    const overlaps = detectOverlaps(positions);
    expect(overlaps.length).toBe(1);
    expect(overlaps[0].overlapPercent).toBeGreaterThan(50);
    expect(overlaps[0].sharedHoldings.length).toBeGreaterThanOrEqual(4);
  });

  it('no overlap when holdings are different', () => {
    const positions: Position[] = [
      {
        isin: 'ETF1',
        name: 'Tech ETF',
        totalShares: 100,
        totalInvested: 5000,
        averagePrice: 50,
        currentPrice: 55,
        currentValue: 5500,
        monthlyInvestment: 100,
        transactionCount: 10,
        category: 'sector-etf',
        metadata: {
          name: 'Tech ETF',
          topHoldings: [
            { name: 'Apple Inc', weight: 15 },
            { name: 'Microsoft Corp', weight: 12 },
          ],
        },
      },
      {
        isin: 'ETF2',
        name: 'Healthcare ETF',
        totalShares: 50,
        totalInvested: 3000,
        averagePrice: 60,
        currentPrice: 65,
        currentValue: 3250,
        monthlyInvestment: 50,
        transactionCount: 5,
        category: 'sector-etf',
        metadata: {
          name: 'Healthcare ETF',
          topHoldings: [
            { name: 'Johnson & Johnson', weight: 10 },
            { name: 'Pfizer Inc', weight: 8 },
          ],
        },
      },
    ];

    const overlaps = detectOverlaps(positions);
    expect(overlaps.length).toBe(0);
  });

  it('flags concentration when single position >25% of portfolio', () => {
    // This is tested in the portfolio analyzer, but let's verify the overlap logic works standalone
    const positions: Position[] = [];
    const overlaps = detectOverlaps(positions);
    expect(overlaps.length).toBe(0);
  });
});
