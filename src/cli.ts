#!/usr/bin/env node
import { Command } from 'commander';
import { calculateCommand } from './commands/calculate.js';
import { analyzeCommand } from './commands/analyze.js';
import { suggestCommand } from './commands/suggest.js';
import { planCommand } from './commands/plan.js';
import { DEFAULT_FIRE_CONFIG, DEFAULT_FLAT, DEFAULT_FINCA } from './config/defaults.js';

const d = DEFAULT_FIRE_CONFIG;
const f = DEFAULT_FLAT;
const fi = DEFAULT_FINCA;

const program = new Command();

program
  .name('fire-planner')
  .description('FIRE (Financial Independence, Retire Early) planner with portfolio analysis')
  .version('1.0.0');

program
  .command('calculate')
  .description('Calculate FIRE scenarios with year-by-year projections')
  .option('--age <n>', `Current age (default: ${d.currentAge})`)
  .option('--target-age <n>', `Target retirement age (default: ${d.targetAge})`)
  .option('--expenses <n>', `Annual expenses in EUR (default: ${d.annualExpenses})`)
  .option('--withdrawal-rate <n>', `Safe withdrawal rate (default: ${d.withdrawalRate})`)
  .option('--inflation <n>', `Annual inflation rate (default: ${d.inflationRate})`)
  .option('--portfolio <n>', `Current portfolio value in EUR (default: ${d.currentPortfolio})`)
  .option('--cash <n>', `Current cash savings in EUR (default: ${d.currentCash})`)
  .option('--monthly <n>', `Monthly savings capacity in EUR (default: ${d.monthlyInvestment})`)
  .option('--rent <n>', `Monthly rent until flat purchase (default: ${d.monthlyRent})`)
  .option('--parent-loan-years <n>', `Years to repay parent loan (default: ${d.parentLoanYears})`)
  .option('--flat-price <n>', `Flat purchase price in EUR (default: ${f.price})`)
  .option('--flat-down <n>', `Flat down payment % (default: ${f.downPaymentPercent})`)
  .option('--flat-fees <n>', `Flat purchase fees % (default: ${f.feesPercent})`)
  .option('--flat-interior <n>', `Flat interior/renovation budget (default: ${f.additionalCosts})`)
  .option('--flat-year <n>', `Year to buy flat, offset from now (default: ${f.purchaseYear})`)
  .option('--flat-term <n>', `Mortgage term in years (default: ${f.mortgageTerm})`)
  .option('--finca-price <n>', `Finca purchase price, 0 to skip (default: ${fi.price})`)
  .option('--finca-down <n>', `Finca down payment % (default: ${fi.downPaymentPercent})`)
  .option('--finca-fees <n>', `Finca purchase fees % (default: ${fi.feesPercent})`)
  .option('--finca-year <n>', `Year to buy finca, offset from now (default: ${fi.purchaseYear})`)
  .option('--rates <list>', `Return rates to model, comma-separated % (default: ${d.returnRates.map((r) => r * 100).join(',')})`)
  .option('--mortgage-rate <n>', `Annual mortgage rate % (default: ${f.mortgageRate})`)
  .action(calculateCommand);

program
  .command('plan')
  .description('Generate investment plan CSV with year-by-year allocation')
  .option('--age <n>', `Current age (default: ${d.currentAge})`)
  .option('--target-age <n>', `Target retirement age (default: ${d.targetAge})`)
  .option('--expenses <n>', `Annual expenses in EUR (default: ${d.annualExpenses})`)
  .option('--portfolio <n>', `Current portfolio value (default: ${d.currentPortfolio})`)
  .option('--cash <n>', `Current cash savings (default: ${d.currentCash})`)
  .option('--monthly <n>', `Monthly savings capacity (default: ${d.monthlyInvestment})`)
  .option('--rent <n>', `Monthly rent until flat (default: ${d.monthlyRent})`)
  .option('--parent-loan-years <n>', `Years to repay parent loan (default: ${d.parentLoanYears})`)
  .option('--flat-price <n>', `Flat price (default: ${f.price})`)
  .option('--flat-down <n>', `Flat down payment % (default: ${f.downPaymentPercent})`)
  .option('--flat-fees <n>', `Flat fees % (default: ${f.feesPercent})`)
  .option('--flat-interior <n>', `Interior budget (default: ${f.additionalCosts})`)
  .option('--flat-year <n>', `Year to buy flat (default: ${f.purchaseYear})`)
  .option('--flat-term <n>', `Mortgage term years (default: ${f.mortgageTerm})`)
  .option('--finca-price <n>', `Finca price, 0 to skip (default: ${fi.price})`)
  .option('--rate <n>', `Return rate % for plan (default: 7)`)
  .option('--mortgage-rate <n>', `Mortgage rate % (default: ${f.mortgageRate})`)
  .option('-o, --output <path>', 'Output CSV file path (default: ./fire-plan.csv)')
  .action(planCommand);

program
  .command('analyze <csv>')
  .description('Analyze Scalable Capital portfolio from CSV export')
  .option('--refresh', 'Force re-fetch from APIs, ignore cache')
  .action(analyzeCommand);

program
  .command('suggest <csv>')
  .description('Analyze portfolio and generate FIRE-aligned suggestions')
  .option('--refresh', 'Force re-fetch from APIs, ignore cache')
  .option('--monthly <n>', `Monthly investment in EUR (default: ${d.monthlyInvestment})`)
  .option('--expenses <n>', `Annual expenses in EUR (default: ${d.annualExpenses})`)
  .action(suggestCommand);

program.parse();
