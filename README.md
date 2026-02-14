# fire-planner

CLI tool for FIRE (Financial Independence, Retire Early) planning with real portfolio analysis. Parses Scalable Capital CSV exports, fetches live market data, and generates concrete savings plan recommendations.

Built for a specific situation: 35yo targeting FIRE by 55, buying a flat in Spain, with a Scalable Capital portfolio — but all parameters are configurable.

## Quick Start

```bash
# Install dependencies
npm install

# Run commands via tsx
npx tsx src/cli.ts calculate
npx tsx src/cli.ts plan
npx tsx src/cli.ts analyze ~/Downloads/portfolio-export.csv
npx tsx src/cli.ts suggest ~/Downloads/portfolio-export.csv
```

## Commands

### `calculate` — FIRE scenario projections

Calculates year-by-year projections at multiple return rates (5%, 7%, 9%) with property purchase milestones, parent loan bridging, and mortgage phases.

```bash
npx tsx src/cli.ts calculate
npx tsx src/cli.ts calculate --monthly 3000 --expenses 50000
npx tsx src/cli.ts calculate --flat-price 400000 --flat-year 2
```

Shows: FIRE number, 3 scenario tables, property breakdown with parent loan gap, phase-by-phase monthly budget, detailed step-by-step math.

### `plan` — Investment allocation CSV export

Generates a semicolon-delimited CSV (European Excel compatible) with year-by-year investment allocation across categories.

```bash
npx tsx src/cli.ts plan
npx tsx src/cli.ts plan --rate 5 -o my-plan.csv
```

Output includes: monthly budget per phase, category allocation (Global+EM 70%, Gold 10%, Stocks 15%, Bonds 5%), FIRE progress tracking.

### `analyze <csv>` — Portfolio analysis

Parses a Scalable Capital CSV export and enriches it with live data from JustETF (TER, distribution type) and OpenFIGI (ISIN resolution).

```bash
npx tsx src/cli.ts analyze ~/Downloads/investments.csv
npx tsx src/cli.ts analyze ~/Downloads/investments.csv --refresh
```

Shows: total value, allocation by category and region, ETF overlap detection, concentration warnings, per-position detail table.

### `suggest <csv>` — Savings plan recommendations

Combines portfolio analysis with FIRE targets to generate concrete, actionable savings plan changes.

```bash
npx tsx src/cli.ts suggest ~/Downloads/investments.csv
npx tsx src/cli.ts suggest ~/Downloads/investments.csv --monthly 4000 --expenses 40000
```

Shows: gap analysis, portfolio suggestions, recommended savings plan table (INCREASE / KEEP / ADD / CANCEL), stock picks, Spanish tax guidance.

## Financial Model

### Three phases

| Phase | Period | Monthly investing |
|---|---|---|
| **Renting** | Until flat purchase | Savings - rent |
| **Mortgage + Parent loan** | After purchase, 10 years | Savings - mortgage - parent loan |
| **Mortgage only** | After parent loan paid off | Savings - mortgage |

### Default assumptions

| Parameter | Value |
|---|---|
| FIRE target | 40,000/yr / 4% SWR = 1,000,000 |
| Monthly savings capacity | 4,000 |
| Rent (until purchase) | 1,400/mo |
| Flat price | 500,000 |
| Down payment | 20% + 12% fees + 30,000 interior |
| Mortgage | 20yr @ 3.2% = ~2,259/mo |
| Parent loan | Interest-free, 10yr repayment |
| Return rates | 5% / 7% / 9% |
| Inflation | 2% |

### Target allocation (Phase 1)

| Category | % | Position |
|---|---|---|
| Global + EM (MSCI ACWI) | 70% | SC MSCI AC World Xtrackers (`LU2903252349`) — 0% TER until Jun 2026 |
| Gold / Commodities | 10% | Xetra-Gold or gold ETC |
| Individual Stocks | 15% | 5 picks: Shopify, ASML, AMD, Airbus, BioNTech |
| Bond ETFs | 5% | iShares Global Aggregate Bond |

### Spanish property defaults

- **Primera vivienda**: 20% down, 12% fees (ITP + notary + registro), 3.2% fixed mortgage
- **Segunda vivienda**: 30% down, 12% fees, 3.2% fixed mortgage
- Debt-to-income max: 35% of gross monthly income

## Data Sources

| Source | What it provides |
|---|---|
| **JustETF** (cheerio scraper) | TER, distributing/accumulating, fund size |
| **OpenFIGI** (free API) | ISIN to ticker resolution |
| **Local cache** | `~/.fire-planner/cache.json`, 7-day TTL. Use `--refresh` to bypass |

## Project Structure

```
src/
  cli.ts                        # Entry point (commander.js)
  types.ts                      # Shared interfaces
  config/defaults.ts            # Default values
  commands/
    calculate.ts                # FIRE scenario projections
    analyze.ts                  # Portfolio analysis
    suggest.ts                  # Savings plan recommendations
    plan.ts                     # CSV export with allocation
  calculators/
    compound.ts                 # Future value, required PMT
    fire.ts                     # FIRE number, gap analysis
    mortgage.ts                 # Monthly mortgage payment
    scenarios.ts                # Multi-phase scenario builder
  parsers/scalable-csv.ts       # Scalable Capital CSV parser
  data/
    cache.ts                    # Local JSON file cache
    isin-resolver.ts            # ISIN resolution (OpenFIGI)
    etf-scraper.ts              # JustETF scraper (cheerio)
  analyzers/
    portfolio.ts                # Position categorization
    overlap.ts                  # ETF overlap detection
    suggestions.ts              # Rule-based suggestions
    recommendation.ts           # Concrete savings plan engine
  formatters/
    colors.ts                   # Chalk theme
    table.ts                    # Terminal table rendering
tests/
  compound.test.ts
  fire.test.ts
  mortgage.test.ts
  scenarios.test.ts
  scalable-csv.test.ts
  portfolio.test.ts
  fixtures/sample-export.csv
```

## Testing

```bash
npm test              # Run all 73 tests
npx vitest --watch    # Watch mode
```

## Tech Stack

- **TypeScript** + **tsx** (runtime)
- **commander.js** (CLI framework)
- **chalk** (terminal colors)
- **csv-parse** (CSV parsing)
- **cheerio** (JustETF HTML scraping)
- **vitest** (testing)

## Tax Notes

The tool's recommendations account for Spanish tax residency, but here's a comparison with Germany since Scalable Capital is a German broker.

### Spain (current)

Spanish capital gains fall under "rentas del ahorro" (savings income), taxed at progressive rates separate from employment income:

| Taxable Savings Income | Rate |
|---|---|
| First 6,000 | 19% |
| 6,000 — 50,000 | 21% |
| 50,000 — 200,000 | 23% |
| 200,000 — 300,000 | 27% |
| Above 300,000 | 30% |

Key rules:

- **No tax-free allowance** — every euro of gain is taxed from the first cent. No equivalent to Germany's Sparerpauschbetrag
- **No short-term vs long-term distinction** — held 1 day or 20 years, same rate. No benefit to waiting
- **FIFO mandatory** — oldest shares sold first (Article 37.2 IRPF). Cannot cherry-pick which lot to sell
- **Loss offsetting** — capital losses offset capital gains in the same year. Up to 25% of excess losses can offset dividends/interest. Unused losses carry forward 4 years
- **2-month wash sale rule** ("regla de los 2 meses") — if you sell at a loss, do NOT rebuy the same ISIN within 2 months before or after. Otherwise the loss is deferred, not recognized. Buying a different ISIN (e.g., switching ETF providers) is fine
- **Scalable Capital does not withhold Spanish tax** — as a German broker (Baader Bank), it only withholds for German residents. Spanish residents must self-declare via the annual Renta (IRPF, filed April—June)
- **Modelo 720** — if total foreign assets (including Scalable Capital holdings) exceed 50,000 at December 31, file this informational declaration by March 31. No tax payment, but mandatory
- **Accumulating ETFs are more tax-efficient** — distributing ETFs trigger taxable dividends yearly; accumulating ETFs defer tax until you sell

### Germany (for comparison)

| Rule | Germany | Spain |
|---|---|---|
| Tax rate | Flat 26.375% (KESt + Soli) | Progressive 19-30% |
| Tax-free allowance | 1,000/yr (Sparerpauschbetrag) | None |
| Holding period benefit | None (abolished 2009) | None |
| Loss offsetting | Yes, but stock losses only offset stock gains | Yes, all capital losses offset all capital gains |
| Wash sale rule | None | 2 months (same ISIN) |
| Withholding | Automatic by broker | Self-declare via Renta |
| FIFO | Yes | Yes |
| Accumulating ETF tax | Vorabpauschale (annual deemed income) | No tax until sale |

### Practical implications

**For small portfolios (< 50k):** Spain is generally more favorable than Germany. The 19% rate on the first 6,000 of gains beats Germany's flat 26.375%, and accumulating ETFs have no annual Vorabpauschale.

**Sell and reorganize early:** Since Spain has no tax-free allowance and no holding period benefit, there's no advantage to waiting. Selling positions while gains are small minimizes the tax hit. Pair winners with losers in the same tax year to offset.

**2-month rule matters when tax-loss harvesting:** If you sell an EM ETF at a loss to consolidate into an ACWI ETF, that's fine (different ISIN). But if you sell and rebuy the same ISIN within 2 months, the loss is deferred.
