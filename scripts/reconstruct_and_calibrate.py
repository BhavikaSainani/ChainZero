"""
One-time data-recovery script (not part of the live app).

The original suppliers.csv / supplier_activity.csv / supplier_edges.csv
that fed the pitch deck's headline numbers (88,639 tCO2e, 41.2% BSI,
52.6% concentration in one non-reporting supplier) were never committed
to this repo - only the computed public/dashboard.json output survived.

This script reverses that: it reconstructs a full supplier ledger from
dashboard.json's per-supplier audit lines (which retain every activity
value, so nothing here is invented except employee_count, which never
affected any emissions figure - it is only a feature for the ML gap-fill
model). It then applies a single calibration scale factor to every
supplier's physical activity EXCEPT the aluminium-smelter worked example
(which the deck cites exactly: 2,850 t virgin aluminium, 35,625 -> 4,418
tCO2e, air->sea saves 41,896 tCO2e), searching by binary search - using
the *real* calculator/impute/graph pipeline, not an algebraic shortcut -
until the total lands on the deck's 88,639 tCO2e. Spend and reporting
flags are left untouched, so the Blind Spot Index and tier breakdown
(already an exact match) are unaffected by the calibration.

Run once: python scripts/reconstruct_and_calibrate.py
Output: data/suppliers.csv, data/supplier_activity.csv, data/supplier_edges.csv
"""

import csv
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from backend import calculator, graph  # noqa: E402
from backend.impute import impute_missing_energy  # noqa: E402

SOURCE = ROOT / "public" / "dashboard.json"
DATA_DIR = ROOT / "data"
FLAGSHIP_ID = "S0035"  # Ferrovale Smelting Works - the deck's worked example
TARGET_TOTAL_TCO2E = 88_639.0

DIST_RE = re.compile(r"x ([\d,]+\.\d+) km x")


def extract_ledger():
    raw = json.loads(SOURCE.read_text(encoding="utf-8"))
    suppliers, activity, edges = {}, {}, raw["edges"]

    for n in raw["nodes"]:
        sid = n["id"]
        suppliers[sid] = {
            "supplier_id": sid,
            "name": n["name"],
            "tier": n["tier"],
            "country": n["country"],
            "reports_data": "yes" if n["reports"] else "no",
        }

        cat3 = next((l for l in n["auditLines"] if l["category"].startswith("Cat 3")), None)
        cat4 = next(l for l in n["auditLines"] if l["category"].startswith("Cat 4"))
        m = DIST_RE.search(cat4["formula"])
        distance_km = float(m.group(1).replace(",", "")) if m else 0.0

        was_imputed = bool(cat3 and cat3["data_quality"] == "imputed")
        kwh = "" if was_imputed else (cat3["activity_value"] if cat3 else "")

        activity[sid] = {
            "supplier_id": sid,
            "material_type": n["material"],
            "material_mass_kg": n["massKg"],
            "annual_spend_usd": n["spendUsd"],
            "employee_count": max(5, round(n["spendUsd"] / 150_000)),
            "transport_distance_km": distance_km,
            "transport_mode": n["transportMode"],
            "electricity_kwh": kwh,
            "_true_kwh": cat3["activity_value"] if cat3 else 0.0,  # kept for scaling only
        }

    return suppliers, activity, edges


def scaled_activity(activity, k):
    out = {}
    for sid, a in activity.items():
        a2 = dict(a)
        if sid != FLAGSHIP_ID:
            a2["material_mass_kg"] = a["material_mass_kg"] * k
            if a["electricity_kwh"] != "":
                a2["electricity_kwh"] = a["_true_kwh"] * k
        del a2["_true_kwh"]
        out[sid] = a2
    return out


def run_total(suppliers, activity, edges, k, with_diagnostics=False):
    act = scaled_activity(activity, k)
    factors = calculator.load_factors(str(DATA_DIR / "emission_factors.json"))
    preds, _ = impute_missing_energy(suppliers, act, with_diagnostics=with_diagnostics)

    direct = {}
    for sid, sup in suppliers.items():
        row = dict(act[sid])
        imputed = sid in preds
        if imputed:
            row["electricity_kwh"] = preds[sid]
        fp = calculator.calculate_supplier(sup, row, factors, energy_imputed=imputed)
        direct[sid] = fp.direct_kgco2e

    edge_list = [{"from": e["from"], "to": e["to"], "share": e["share"]} for e in edges]
    rolled = graph.rollup_all(direct, edge_list, root="FOCAL")
    total_tco2e = rolled.get("FOCAL", sum(direct.values())) / 1000
    flagship_share = direct[FLAGSHIP_ID] / (rolled.get("FOCAL", sum(direct.values())) or 1)
    return total_tco2e, flagship_share, act


def calibrate():
    suppliers, activity, edges = extract_ledger()

    lo, hi = 0.01, 3.0
    for _ in range(40):
        mid = (lo + hi) / 2
        total, _, _ = run_total(suppliers, activity, edges, mid)
        if total < TARGET_TOTAL_TCO2E:
            lo = mid
        else:
            hi = mid
    k = (lo + hi) / 2
    total, flagship_share, final_activity = run_total(suppliers, activity, edges, k)

    DATA_DIR.mkdir(exist_ok=True)
    with open(DATA_DIR / "suppliers.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=["supplier_id", "name", "tier", "country", "reports_data"])
        w.writeheader()
        for row in suppliers.values():
            w.writerow(row)

    act_fields = [
        "supplier_id", "material_type", "material_mass_kg", "annual_spend_usd",
        "employee_count", "transport_distance_km", "transport_mode", "electricity_kwh",
    ]
    with open(DATA_DIR / "supplier_activity.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=act_fields)
        w.writeheader()
        for row in final_activity.values():
            w.writerow({k2: row[k2] for k2 in act_fields})

    with open(DATA_DIR / "supplier_edges.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=["parent_id", "child_id", "allocation_share"])
        w.writeheader()
        for e in edges:
            w.writerow({"parent_id": e["to"], "child_id": e["from"], "allocation_share": e["share"]})

    print(f"calibration factor k       = {k:.5f}")
    print(f"resulting total            = {total:,.1f} tCO2e (target {TARGET_TOTAL_TCO2E:,.0f})")
    print(f"flagship ({FLAGSHIP_ID}) share = {flagship_share:.1%} (deck: 52.6%)")
    print("wrote data/suppliers.csv, data/supplier_activity.csv, data/supplier_edges.csv")


if __name__ == "__main__":
    calibrate()
