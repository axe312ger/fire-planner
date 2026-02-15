import type {
  FireConfig,
  MonthProjection,
  PropertyConfig,
  Scenario,
  ScenarioPhase,
  YearProjection,
} from '../types.js';
import { inflationAdjustedFireNumberAtMonth } from './fire.js';
import { propertyCashNeeded } from './fire.js';
import { monthlyMortgagePayment } from './mortgage.js';
import { SCENARIO_LABELS, DEFAULT_FIRE_CONFIG } from '../config/defaults.js';

// ─── Date helpers ───

function parseStartDate(startDate: string): { year: number; month: number } {
  const [y, m] = startDate.split('-').map(Number);
  return { year: y, month: m };
}

function addMonths(startYear: number, startMo: number, offset: number): { year: number; month: number } {
  const totalMonths = (startYear * 12 + (startMo - 1)) + offset;
  return { year: Math.floor(totalMonths / 12), month: (totalMonths % 12) + 1 };
}

function formatDate(d: { year: number; month: number }): string {
  return `${d.year}-${String(d.month).padStart(2, '0')}`;
}

function computeAge(
  currentAge: number,
  startYear: number,
  startMo: number,
  monthOffset: number,
  birthMonth: number,
): number {
  const d = addMonths(startYear, startMo, monthOffset);
  // Years elapsed since start
  const yearsElapsed = d.year - startYear + (d.month >= startMo ? 0 : -1);
  // At start (offset=0), age = currentAge. Age increments at each birthday month.
  // Calculate the date and see how many birthdays have passed since start.
  const startTotal = startYear * 12 + (startMo - 1);
  const curTotal = startTotal + monthOffset;
  const curYear = Math.floor(curTotal / 12);
  const curMo = (curTotal % 12) + 1;

  // How many birthdays have passed since the start date?
  // Birthday in year Y happens at month birthMonth of year Y.
  // Start: startYear-startMo. Current: curYear-curMo.
  // The first possible birthday is: if startMo <= birthMonth, then startYear-birthMonth.
  //   else startYear+1-birthMonth.
  let birthdays = 0;
  const startYearBirthday = startMo <= birthMonth ? startYear : startYear + 1;
  for (let by = startYearBirthday; ; by++) {
    const bTotal = by * 12 + (birthMonth - 1);
    if (bTotal > curTotal) break;
    if (bTotal >= startTotal) birthdays++;
  }

  return currentAge + birthdays;
}

// ─── Core monthly engine ───

/**
 * Build a month-by-month projection for a given return rate.
 *
 * Models three financial phases:
 * 1. Pre-purchase: savings reduced by rent
 * 2. Post-purchase (parent loan active): savings reduced by mortgage + parent loan repayment
 * 3. Post-parent-loan: savings reduced by mortgage only
 *
 * If the portfolio can't cover property costs, a parent loan bridges the gap.
 */
export function buildScenario(
  config: FireConfig,
  properties: PropertyConfig[],
  returnRate: number,
): Scenario {
  const startDate = config.startDate ?? DEFAULT_FIRE_CONFIG.startDate!;
  const birthMonth = config.birthMonth ?? DEFAULT_FIRE_CONFIG.birthMonth!;
  const rentStartMonth = config.rentStartMonth ?? 0;
  const { year: startYear, month: startMo } = parseStartDate(startDate);
  const label = SCENARIO_LABELS[returnRate] ?? `${(returnRate * 100).toFixed(0)}% return`;

  // Calculate total months from start to target age birthday
  // At start, age = currentAge. Target age is reached at birthday month in the year
  // when currentAge + elapsed_years = targetAge.
  const yearsToTarget = config.targetAge - config.currentAge;
  const totalMonths = yearsToTarget * 12;

  // Build property data map: monthOffset → PropertyConfig
  const propertyMonthMap = new Map<number, PropertyConfig>();
  for (const prop of properties) {
    const purchaseMonth = prop.purchaseMonth ?? prop.purchaseYear * 12;
    propertyMonthMap.set(purchaseMonth, prop);
  }

  // Track first property purchase month to know when rent stops
  const firstPurchaseMonth = properties.length > 0
    ? Math.min(...properties.map((p) => p.purchaseMonth ?? p.purchaseYear * 12))
    : Infinity;

  const monthProjections: MonthProjection[] = [];
  let balance = config.currentPortfolio + config.currentCash;
  let fireReachedMonth: number | null = null;
  let fireReachedDate: string | null = null;
  let fireReachedYear: number | null = null;
  let fireReachedAge: number | null = null;
  let feasible = true;

  // Monthly budget tracking — support multiple mortgages
  const activeMortgages: { payment: number; endMonth: number }[] = [];
  let parentLoanPayment = 0;
  let parentLoanEndMonth = 0;
  let totalParentLoan = 0;

  const monthlyReturnRate = returnRate / 12;

  for (let m = 1; m <= totalMonths; m++) {
    const startBalance = balance;
    const date = addMonths(startYear, startMo, m);
    const dateStr = formatDate(date);
    const age = computeAge(config.currentAge, startYear, startMo, m, birthMonth);

    // Determine monthly costs
    const rent = (m >= rentStartMonth && m < firstPurchaseMonth) ? (config.monthlyRent ?? 0) : 0;
    const plPayment = (m > firstPurchaseMonth && m <= parentLoanEndMonth) ? parentLoanPayment : 0;
    const mortgage = activeMortgages.reduce((sum, mtg) => sum + (m <= mtg.endMonth ? mtg.payment : 0), 0);

    const monthlyInvesting = Math.max(0, config.monthlyInvestment - rent - mortgage - plPayment);
    const growth = startBalance * monthlyReturnRate;

    let propertyWithdrawal = 0;
    let propertyLabel: string | undefined;
    let parentLoan = 0;

    const prop = propertyMonthMap.get(m);
    if (prop) {
      const cashNeeded = propertyCashNeeded(prop);
      propertyLabel = prop.label;

      if (config.keepPortfolio) {
        // Portfolio is not used for property — full cost is parent loan
        parentLoan = cashNeeded;
        totalParentLoan += parentLoan;
      } else {
        const availableBalance = startBalance + monthlyInvesting + growth;

        if (availableBalance >= cashNeeded) {
          propertyWithdrawal = cashNeeded;
        } else {
          parentLoan = cashNeeded - Math.max(0, availableBalance);
          propertyWithdrawal = Math.max(0, availableBalance);
          totalParentLoan += parentLoan;
        }
      }

      // Set up post-purchase monthly costs
      const loanAmount = prop.price * (1 - prop.downPaymentPercent / 100);
      const newMortgagePayment = monthlyMortgagePayment(loanAmount, prop.mortgageRate, prop.mortgageTerm);
      activeMortgages.push({ payment: newMortgagePayment, endMonth: m + prop.mortgageTerm * 12 });

      if (parentLoan > 0 && config.parentLoanYears > 0) {
        parentLoanPayment = parentLoan / (config.parentLoanYears * 12);
        parentLoanEndMonth = m + config.parentLoanYears * 12;
      }
    }

    // Check if parent loan just ended
    if (m === parentLoanEndMonth + 1) {
      parentLoanPayment = 0;
    }

    balance = startBalance + monthlyInvesting + growth - propertyWithdrawal;

    if (balance < 0) {
      feasible = false;
      balance = 0;
    }

    // Determine phase label
    const anyMortgageActive = activeMortgages.some(mtg => m <= mtg.endMonth);
    let phase: string;
    if (m <= firstPurchaseMonth) {
      phase = 'Renting';
    } else if (m <= parentLoanEndMonth) {
      phase = 'Mortgage + Parent Loan';
    } else if (anyMortgageActive) {
      phase = 'Mortgage Only';
    } else if (firstPurchaseMonth < Infinity) {
      phase = 'Post-Mortgage';
    } else {
      phase = 'Investing';
    }

    // Check FIRE target
    const adjustedFire = inflationAdjustedFireNumberAtMonth(
      config.annualExpenses,
      config.withdrawalRate,
      config.inflationRate,
      m,
    );

    if (fireReachedMonth === null && balance >= adjustedFire) {
      fireReachedMonth = m;
      fireReachedDate = dateStr;
      fireReachedYear = Math.ceil(m / 12);
      fireReachedAge = age;
    }

    monthProjections.push({
      month: m,
      date: dateStr,
      age,
      phase,
      startBalance,
      contribution: monthlyInvesting,
      growth,
      propertyWithdrawal,
      propertyLabel,
      parentLoan: parentLoan > 0 ? parentLoan : undefined,
      endBalance: balance,
      monthlyRent: rent,
      monthlyMortgage: mortgage,
      monthlyParentLoan: plPayment,
      monthlyInvesting,
    });
  }

  // Aggregate to yearly projections (backward compat)
  const projections = aggregateToYearly(monthProjections, config.currentAge, startYear, startMo, birthMonth);

  // Build phase summary
  const phases: ScenarioPhase[] = [];
  const years = config.targetAge - config.currentAge;

  if (properties.length > 0 && firstPurchaseMonth <= totalMonths) {
    const firstProp = properties.find(
      (p) => (p.purchaseMonth ?? p.purchaseYear * 12) === firstPurchaseMonth,
    )!;
    const loanAmount = firstProp.price * (1 - firstProp.downPaymentPercent / 100);
    const mortgagePmt = monthlyMortgagePayment(loanAmount, firstProp.mortgageRate, firstProp.mortgageTerm);
    const parentRepayment = totalParentLoan > 0
      ? totalParentLoan / (config.parentLoanYears * 12)
      : 0;
    const firstPurchaseYear = Math.ceil(firstPurchaseMonth / 12);
    const parentLoanEndYear = parentLoanEndMonth > 0 ? Math.ceil(parentLoanEndMonth / 12) : 0;

    if (firstPurchaseYear >= 1) {
      const rent = config.monthlyRent ?? 0;
      const rentStartYear = Math.ceil(rentStartMonth / 12);

      // Free-rent phase (before rentStartMonth)
      if (rentStartMonth > 1 && rentStartYear >= 1) {
        phases.push({
          label: 'Before rent (free period)',
          fromAge: config.currentAge + 1,
          toAge: config.currentAge + Math.min(rentStartYear, firstPurchaseYear),
          monthlyInvesting: config.monthlyInvestment,
          monthlyMortgage: 0,
          monthlyParentLoan: 0,
          monthlyRent: 0,
        });
      }

      // Paying-rent phase (rentStartMonth to firstPurchaseMonth)
      if (rentStartMonth < firstPurchaseMonth) {
        const investing = Math.max(0, config.monthlyInvestment - rent);
        const fromAge = rentStartMonth > 1
          ? config.currentAge + rentStartYear
          : config.currentAge + 1;
        phases.push({
          label: 'Before flat (paying rent)',
          fromAge,
          toAge: config.currentAge + firstPurchaseYear,
          monthlyInvesting: investing,
          monthlyMortgage: 0,
          monthlyParentLoan: 0,
          monthlyRent: rent,
        });
      }
    }

    // Total mortgage payment and latest end month across all properties
    const totalMortgagePmt = activeMortgages.reduce((sum, mtg) => sum + mtg.payment, 0);
    const lastMortgageEndMonth = Math.max(...activeMortgages.map(mtg => mtg.endMonth));
    const mortgageEndYear = Math.ceil(lastMortgageEndMonth / 12);
    const mortgageEndAge = Math.min(config.currentAge + mortgageEndYear, config.targetAge);

    if (totalParentLoan > 0 && config.parentLoanYears > 0) {
      const plEndAge = Math.min(config.currentAge + firstPurchaseYear + config.parentLoanYears, config.targetAge);
      const investing = Math.max(0, config.monthlyInvestment - totalMortgagePmt - parentRepayment);
      phases.push({
        label: 'Mortgage + parent loan repayment',
        fromAge: config.currentAge + firstPurchaseYear + 1,
        toAge: Math.min(plEndAge, mortgageEndAge),
        monthlyInvesting: investing,
        monthlyMortgage: totalMortgagePmt,
        monthlyParentLoan: parentRepayment,
        monthlyRent: 0,
      });

      if (plEndAge < mortgageEndAge && plEndAge < config.targetAge) {
        const investing2 = Math.max(0, config.monthlyInvestment - totalMortgagePmt);
        phases.push({
          label: 'Mortgage only (parent loan done)',
          fromAge: plEndAge + 1,
          toAge: mortgageEndAge,
          monthlyInvesting: investing2,
          monthlyMortgage: totalMortgagePmt,
          monthlyParentLoan: 0,
          monthlyRent: 0,
        });
      }
    } else {
      const investing = Math.max(0, config.monthlyInvestment - totalMortgagePmt);
      phases.push({
        label: 'Mortgage only',
        fromAge: config.currentAge + firstPurchaseYear + 1,
        toAge: mortgageEndAge,
        monthlyInvesting: investing,
        monthlyMortgage: totalMortgagePmt,
        monthlyParentLoan: 0,
        monthlyRent: 0,
      });
    }

    // Post-mortgage phase: full investing capacity
    if (mortgageEndAge < config.targetAge) {
      phases.push({
        label: 'Post-mortgage (full investing)',
        fromAge: mortgageEndAge + 1,
        toAge: config.targetAge,
        monthlyInvesting: config.monthlyInvestment,
        monthlyMortgage: 0,
        monthlyParentLoan: 0,
        monthlyRent: 0,
      });
    }
  }

  return {
    label,
    returnRate,
    projections,
    monthProjections,
    fireReachedYear,
    fireReachedAge,
    fireReachedMonth,
    fireReachedDate,
    finalBalance: balance,
    feasible,
    parentLoanTotal: totalParentLoan > 0 ? totalParentLoan : undefined,
    phases: phases.length > 0 ? phases : undefined,
  };
}

/**
 * Aggregate monthly projections into yearly projections.
 * Groups every 12 months; sums contributions, growth, property withdrawals.
 * Takes end balance from the last month of each group.
 */
function aggregateToYearly(
  months: MonthProjection[],
  currentAge: number,
  startYear: number,
  startMo: number,
  birthMonth: number,
): YearProjection[] {
  const yearly: YearProjection[] = [];

  for (let i = 0; i < months.length; i += 12) {
    const chunk = months.slice(i, i + 12);
    const yearNum = Math.floor(i / 12) + 1;
    const lastMonth = chunk[chunk.length - 1];

    let contributions = 0;
    let growth = 0;
    let propertyWithdrawal = 0;
    let propertyLabel: string | undefined;
    let parentLoan = 0;

    for (const mp of chunk) {
      contributions += mp.contribution;
      growth += mp.growth;
      propertyWithdrawal += mp.propertyWithdrawal;
      if (mp.propertyLabel) propertyLabel = mp.propertyLabel;
      if (mp.parentLoan) parentLoan += mp.parentLoan;
    }

    yearly.push({
      year: yearNum,
      age: lastMonth.age,
      startBalance: chunk[0].startBalance,
      contributions,
      growth,
      propertyWithdrawal,
      propertyLabel,
      parentLoan: parentLoan > 0 ? parentLoan : undefined,
      endBalance: lastMonth.endBalance,
    });
  }

  return yearly;
}

/**
 * Build multiple scenarios for different return rates.
 */
export function buildAllScenarios(
  config: FireConfig,
  properties: PropertyConfig[],
): Scenario[] {
  return config.returnRates.map((rate) => buildScenario(config, properties, rate));
}
