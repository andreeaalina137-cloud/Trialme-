# All-UK Bank Statement Corpus

Synthetic, non-personal UK fixtures for offline scanner regression testing.
The corpus covers every preset currently in `src/data/monetry_database.json`,
plus the requested Google One, Microsoft 365, low-price variants, explicit
subscription aliases, and daily-payment false-positive traps.

The bank list follows every provider named in the requirement: Monzo, Barclays,
Lloyds, Halifax, Revolut, HSBC, First Direct, NatWest, RBS, Santander, Starling
and Nationwide. The two latter files are trap-only statements because all 49
catalogue presets are already distributed across the first ten statement sets.

`all-banks.csv` is a Monzo-style CSV export with an additional bank field for
cross-bank assertions. The `*.txt` files model PDF text extraction output,
including prefixes, multiline rows, references, negative Revolut amounts and
UK date formats. All amounts are synthetic GBP values.
