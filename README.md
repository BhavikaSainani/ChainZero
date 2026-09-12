# ChainZero
Carbon-Aware Supply Chain Dashboard

Auditable Scope 3 accounting across 200 multi-tier suppliers (413 flow
links), plus the Blind Spot Index — a measure of what the numbers don't
see yet.

## Architecture

Nothing is pre-computed. The frontend calls a live FastAPI backend that
runs the full pipeline (Ingest -> Calculate -> Propagate -> Diagnose) on
every request, straight from the CSV ledger in `data/`:

- `data/suppliers.csv`, `data/supplier_activity.csv`, `data/supplier_edges.csv` — the ingested supplier ledger (200 suppliers, 413 links)
- `data/emission_factors.json` — cited, versioned DEFRA / EPA / IEA / CEA factors
- `backend/calculator.py` — pure functions turning activity + factors into GHG Protocol audit lines (Cat 1, 3, 4)
- `backend/impute.py` — gradient-boosted gap-fill for suppliers with unreported energy (scikit-learn), flagged `imputed` everywhere it appears
- `backend/graph.py` — NetworkX multi-tier rollup through weighted allocation shares
- `backend/blindspot.py` — the Blind Spot Index: spend-weighted share of suppliers with an unfilled data gap
- `backend/main.py` — FastAPI endpoints (`/api/dashboard`, `/api/simulate`, `/api/export/audit.csv`)

## Run it

Two processes, two terminals:

```bash
pip install -r requirements.txt
npm run server     # FastAPI on :8000

npm install
npm run dev         # Vite on :3000, proxies /api to :8000
```

Open http://localhost:3000.

## Data provenance note

The original CSVs behind the pitch deck's headline figures (88,639 tCO2e
total, 41.2% Blind Spot Index, 52.6% concentration in one non-reporting
aluminium smelter) were never committed to this repo — only a computed
JSON snapshot survived. `scripts/reconstruct_and_calibrate.py` rebuilt a
synthetic ledger from that snapshot (every activity value it used to
compute Cat 1/3/4 emissions is recoverable from the snapshot's audit
trail) and calibrated it, via the real pipeline, to land back on those
figures. It is a recreation, not the original dataset, and is documented
here so that provenance stays honest. Current live output: ~88,627 tCO2e,
41.2% BSI, 53.1% concentration.
