import type { PortfolioAnalysis, Position, AssetCategory } from '../types.js';

/**
 * Target allocation category — maps to investment categories with specific targets.
 */
export interface AllocationTarget {
  label: string;
  percent: number;
  categories: AssetCategory[]; // which portfolio categories count toward this target
  preferredIsins?: string[]; // specific ISINs to prioritize (in order of preference)
  maxPositions?: number; // limit how many positions to keep in this category
}

/**
 * A concrete recommendation for a single savings plan.
 */
export interface SavingsPlanAction {
  action: 'increase' | 'keep' | 'cancel' | 'add';
  isin: string;
  name: string;
  currentMonthly: number;
  targetMonthly: number;
  change: number;
  category: string; // which allocation target this belongs to
  reason: string;
}

/**
 * The default FIRE-optimized allocation for Phase 1.
 *
 * Until June 2026: Global + EM merged into 70% via SC MSCI AC World (0% TER promo).
 * After June 2026: Consider splitting back to 60% Global + 10% dedicated EM ETF.
 */
export const FIRE_ALLOCATION: AllocationTarget[] = [
  {
    label: 'Global + EM (MSCI ACWI)',
    percent: 70,
    categories: ['global-etf', 'regional-etf'],
    preferredIsins: ['LU2903252349'], // SC MSCI AC World Xtrackers — 0% TER until 11 Jun 2026
    maxPositions: 1,
  },
  {
    label: 'Gold / Commodities',
    percent: 10,
    categories: ['commodity'],
    maxPositions: 1,
  },
  {
    label: 'Individual Stocks',
    percent: 15,
    categories: ['individual-stock'],
    preferredIsins: [
      'CA82509L1076', // Shopify — high conviction
      'NL0010273215', // ASML — European semi leader
      'US0079031078', // AMD — AI/compute
      'NL0000235190', // Airbus — European defence/aviation
      'US09075V1026', // BioNTech — mRNA cancer moonshot
    ],
    maxPositions: 5,
  },
  {
    label: 'Bond ETFs',
    percent: 5,
    categories: ['bond-etf'],
    maxPositions: 1,
  },
];

/**
 * Stock allocation within the individual stocks budget.
 * Maps ISIN → target monthly amount.
 */
const STOCK_TARGETS: Record<string, { monthly: number; reason: string }> = {
  'CA82509L1076': { monthly: 100, reason: 'High conviction — e-commerce platform leader' },
  'NL0010273215': { monthly: 75, reason: 'European semiconductor leader, EUV monopoly' },
  'US0079031078': { monthly: 75, reason: 'AI & high-performance computing play' },
  'NL0000235190': { monthly: 75, reason: 'European defence & aviation, Boeing alternative' },
  'US09075V1026': { monthly: 65, reason: 'mRNA cancer vaccine moonshot — asymmetric upside' },
};

/**
 * Suggested new positions when a category has no existing holdings.
 */
const NEW_POSITION_SUGGESTIONS: Record<string, { isin: string; name: string; reason: string }> = {
  'Global + EM (MSCI ACWI)': {
    isin: 'LU2903252349',
    name: 'Scalable MSCI AC World Xtrackers UCITS ETF 1C',
    reason: '0% TER until Jun 2026, then 0.17% — MSCI ACWI covers developed + EM',
  },
  'Bond ETFs': {
    isin: 'IE00BYZ28V50',
    name: 'iShares Core Global Aggregate Bond UCITS ETF',
    reason: 'Broad bond diversification, 0.10% TER, accumulating',
  },
};

/**
 * Generate a concrete savings plan recommendation.
 * Compares current portfolio to the target FIRE allocation and produces
 * specific, actionable changes for each savings plan.
 */
export function generateRecommendation(
  analysis: PortfolioAnalysis,
  monthlyBudget: number,
  allocation: AllocationTarget[] = FIRE_ALLOCATION,
): SavingsPlanAction[] {
  const actions: SavingsPlanAction[] = [];
  const assignedIsins = new Set<string>();

  for (const target of allocation) {
    const categoryBudget = monthlyBudget * target.percent / 100;

    if (target.label === 'Individual Stocks') {
      // Handle stocks with specific per-stock targets
      const stockActions = recommendStocks(analysis, categoryBudget, target, assignedIsins);
      actions.push(...stockActions);
      continue;
    }

    // For generic categories: prefer specific ISINs if set, otherwise pick by TER
    const categoryPositions = analysis.positions
      .filter((p) => target.categories.includes(p.category) && !assignedIsins.has(p.isin))
      .sort((a, b) => {
        // Preferred ISINs first, then lower TER, then higher current value
        const preferredIsins = target.preferredIsins ?? [];
        const aPreferred = preferredIsins.includes(a.isin) ? 0 : 1;
        const bPreferred = preferredIsins.includes(b.isin) ? 0 : 1;
        if (aPreferred !== bPreferred) return aPreferred - bPreferred;
        const terA = a.metadata?.ter ?? 1;
        const terB = b.metadata?.ter ?? 1;
        if (terA !== terB) return terA - terB;
        return b.currentValue - a.currentValue;
      });

    const maxPositions = target.maxPositions ?? 3;
    const kept = categoryPositions.slice(0, maxPositions);
    const cancelled = categoryPositions.slice(maxPositions);

    if (kept.length === 0) {
      // No existing position — suggest a new one
      const suggestion = NEW_POSITION_SUGGESTIONS[target.label];
      if (suggestion) {
        actions.push({
          action: 'add',
          isin: suggestion.isin,
          name: suggestion.name,
          currentMonthly: 0,
          targetMonthly: categoryBudget,
          change: categoryBudget,
          category: target.label,
          reason: suggestion.reason,
        });
      }
      continue;
    }

    // Distribute budget across kept positions (proportional to current value, or equal)
    const budgetPerPosition = kept.length > 1
      ? distributeBudget(kept, categoryBudget)
      : [categoryBudget];

    for (let i = 0; i < kept.length; i++) {
      const pos = kept[i];
      const targetMonthly = Math.round(budgetPerPosition[i]);
      assignedIsins.add(pos.isin);

      const isPreferred = target.preferredIsins?.includes(pos.isin);
      actions.push({
        action: targetMonthly > pos.monthlyInvestment ? 'increase' : 'keep',
        isin: pos.isin,
        name: pos.name,
        currentMonthly: pos.monthlyInvestment,
        targetMonthly,
        change: targetMonthly - pos.monthlyInvestment,
        category: target.label,
        reason: isPreferred
          ? 'Preferred — 0% TER promo until Jun 2026'
          : pos.metadata?.ter
            ? `TER ${(pos.metadata.ter * 100).toFixed(2)}%`
            : 'Core position',
      });
    }

    // Cancel the rest in this category
    for (const pos of cancelled) {
      if (pos.monthlyInvestment > 0) {
        assignedIsins.add(pos.isin);
        actions.push({
          action: 'cancel',
          isin: pos.isin,
          name: pos.name,
          currentMonthly: pos.monthlyInvestment,
          targetMonthly: 0,
          change: -pos.monthlyInvestment,
          category: target.label,
          reason: `Cancel plan + sell shares — consolidate into ${target.label}`,
        });
      }
    }
  }

  // Cancel all remaining positions not assigned to any target
  for (const pos of analysis.positions) {
    if (!assignedIsins.has(pos.isin) && pos.monthlyInvestment > 0) {
      actions.push({
        action: 'cancel',
        isin: pos.isin,
        name: pos.name,
        currentMonthly: pos.monthlyInvestment,
        targetMonthly: 0,
        change: -pos.monthlyInvestment,
        category: categorizeForDisplay(pos.category),
        reason: 'Cancel plan + sell shares — not in target allocation',
      });
    }
  }

  // Sort: increases first, keeps, adds, then cancels
  const order: Record<string, number> = { increase: 0, keep: 1, add: 2, cancel: 3 };
  actions.sort((a, b) => (order[a.action] ?? 9) - (order[b.action] ?? 9));

  return actions;
}

function recommendStocks(
  analysis: PortfolioAnalysis,
  budget: number,
  target: AllocationTarget,
  assignedIsins: Set<string>,
): SavingsPlanAction[] {
  const actions: SavingsPlanAction[] = [];
  const preferredIsins = target.preferredIsins ?? [];
  let remaining = budget;

  // First: assign preferred stocks with specific targets
  for (const isin of preferredIsins) {
    const pos = analysis.positions.find((p) => p.isin === isin);
    const stockTarget = STOCK_TARGETS[isin];
    if (!stockTarget) continue;

    const targetMonthly = Math.min(stockTarget.monthly, remaining);
    remaining -= targetMonthly;
    assignedIsins.add(isin);

    if (pos) {
      actions.push({
        action: targetMonthly > pos.monthlyInvestment ? 'increase' : 'keep',
        isin,
        name: pos.name,
        currentMonthly: pos.monthlyInvestment,
        targetMonthly,
        change: targetMonthly - pos.monthlyInvestment,
        category: 'Individual Stocks',
        reason: stockTarget.reason,
      });
    } else {
      actions.push({
        action: 'add',
        isin,
        name: isin,
        currentMonthly: 0,
        targetMonthly,
        change: targetMonthly,
        category: 'Individual Stocks',
        reason: stockTarget.reason,
      });
    }
  }

  // Cancel all other stock savings plans
  for (const pos of analysis.positions) {
    if (pos.category === 'individual-stock' && !assignedIsins.has(pos.isin) && pos.monthlyInvestment > 0) {
      assignedIsins.add(pos.isin);
      actions.push({
        action: 'cancel',
        isin: pos.isin,
        name: pos.name,
        currentMonthly: pos.monthlyInvestment,
        targetMonthly: 0,
        change: -pos.monthlyInvestment,
        category: 'Individual Stocks',
        reason: 'Cancel plan + sell shares — max 5 stock picks',
      });
    }
  }

  return actions;
}

function distributeBudget(positions: Position[], totalBudget: number): number[] {
  // Distribute proportional to current value, with minimum 25% each
  const totalValue = positions.reduce((s, p) => s + Math.max(p.currentValue, 1), 0);
  return positions.map((p) => {
    const proportion = Math.max(p.currentValue, 1) / totalValue;
    return totalBudget * proportion;
  });
}

function categorizeForDisplay(category: AssetCategory): string {
  const map: Record<string, string> = {
    'global-etf': 'Global ETFs',
    'regional-etf': 'Regional/Sector ETFs',
    'sector-etf': 'Sector ETFs',
    'bond-etf': 'Bond ETFs',
    'commodity': 'Gold / Commodities',
    'individual-stock': 'Individual Stocks',
    'crypto': 'Crypto',
    'other': 'Other',
  };
  return map[category] ?? 'Other';
}
