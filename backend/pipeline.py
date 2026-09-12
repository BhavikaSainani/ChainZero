"""
Orchestrates the full engine: Ingest -> Calculate -> Propagate -> Diagnose.

Nothing here is pre-computed or cached to disk. `run_pipeline()` reads the
supplier ledger CSVs fresh, runs the ML gap-fill, calculates every audit
line from cited factors, propagates emissions through the multi-tier graph,
and derives the Blind Spot Index - every time it is called. The API layer
decides how often that happens (on startup, per request, or on demand via
a "recompute" endpoint).
"""

import csv
import os

from . import calculator, graph
from .blindspot import compute_blind_spot
from .impute import impute_missing_energy

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data")

ALTERNATIVE_PATHWAYS = ["virgin_aluminium", "virgin_steel", "virgin_plastic_pet", "air_freight"]


def _read_csv(name):
    path = os.path.join(DATA_DIR, name)
    with open(path, newline="", encoding="utf-8") as f:
        return {row["supplier_id"]: row for row in csv.DictReader(f)}


def _read_edges():
    path = os.path.join(DATA_DIR, "supplier_edges.csv")
    with open(path, newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def run_pipeline():
    suppliers = _read_csv("suppliers.csv")
    activity = _read_csv("supplier_activity.csv")
    edges_raw = _read_edges()
    edges = [{"from": e["child_id"], "to": e["parent_id"], "share": float(e["allocation_share"])} for e in edges_raw]
    factors = calculator.load_factors(os.path.join(DATA_DIR, "emission_factors.json"))

    # --- Calculate: fill energy gaps, then compute every audit line ------
    preds, impute_diagnostics = impute_missing_energy(suppliers, activity)

    footprints = {}
    for sid, sup in suppliers.items():
        act = dict(activity[sid])
        imputed = sid in preds
        if imputed:
            act["electricity_kwh"] = preds[sid]
        fp = calculator.calculate_supplier(sup, act, factors, energy_imputed=imputed)
        footprints[sid] = fp

    imputed_line_count = sum(1 for fp in footprints.values() for l in fp.lines if l["data_quality"] == "imputed")
    total_line_count = sum(len(fp.lines) for fp in footprints.values())

    # --- Propagate: multi-tier rollup ------------------------------------
    direct_by_id = {sid: fp.direct_kgco2e for sid, fp in footprints.items()}
    rolled_up = graph.rollup_all(direct_by_id, edges, root="FOCAL")
    company_total_kgco2e = rolled_up.get("FOCAL", sum(direct_by_id.values()))

    # --- Diagnose: hotspots + Blind Spot Index ---------------------------
    nodes = []
    for sid, sup in suppliers.items():
        fp = footprints[sid]
        energy_imputed = any(l["category"].startswith("Cat 3") and l["data_quality"] == "imputed" for l in fp.lines)
        nodes.append({
            "id": sid,
            "name": sup["name"],
            "tier": int(sup["tier"]),
            "country": sup["country"],
            "reports": sup["reports_data"] == "yes",
            "energyImputed": energy_imputed,
            "material": activity[sid]["material_type"],
            "massKg": float(activity[sid]["material_mass_kg"]),
            "transportMode": activity[sid]["transport_mode"],
            "spendUsd": float(activity[sid]["annual_spend_usd"]),
            "directTco2e": round(fp.direct_kgco2e / 1000, 2),
            "rolledUpTco2e": round(rolled_up.get(sid, fp.direct_kgco2e) / 1000, 2),
            "shareOfTotal": round(fp.direct_kgco2e / (company_total_kgco2e or 1), 5),
            "auditLines": fp.lines,
        })
    nodes.sort(key=lambda n: -n["directTco2e"])

    by_category = {}
    for fp in footprints.values():
        for line in fp.lines:
            by_category[line["category"]] = by_category.get(line["category"], 0.0) + line["kgco2e"] / 1000

    suppliers_with_spend = {
        sid: {**sup, "annual_spend_usd": activity[sid]["annual_spend_usd"]}
        for sid, sup in suppliers.items()
    }
    has_gap = {
        sid: any(l["category"].startswith("Cat 3") and l["data_quality"] == "imputed" for l in fp.lines)
        for sid, fp in footprints.items()
    }
    blind_spot = compute_blind_spot(
        suppliers_with_spend, direct_by_id, imputed_line_count, total_line_count, has_gap
    )
    # blind_spot direct_tco2e in worst_offenders uses kg-scale direct_by_id; fix units
    for w in blind_spot["worst_offenders"]:
        w["direct_tco2e"] = round(direct_by_id.get(w["supplier_id"], 0.0) / 1000, 2)
    blind_spot["worst_offenders"] = blind_spot["worst_offenders"][:5]

    imputed_share_numer = sum(n["directTco2e"] for n in nodes if n["energyImputed"])
    imputed_share_denom = sum(n["directTco2e"] for n in nodes) or 1

    alternatives = []
    for material_key in ("virgin_aluminium", "virgin_steel", "virgin_plastic_pet"):
        alt = calculator.circular_alternative(material_key, factors)
        if not alt:
            continue
        base = factors["materials_kgco2e_per_kg"][material_key]["value"]
        target = factors["materials_kgco2e_per_kg"][alt]["value"]
        alternatives.append({
            "from": material_key,
            "to": alt,
            "reductionPct": round((1 - target / base) * 100, 1),
        })
    air = factors["transport_kgco2e_per_tonne_km"]["air_freight"]["value"]
    sea = factors["transport_kgco2e_per_tonne_km"]["sea_freight"]["value"]
    alternatives.append({"from": "air_freight", "to": "sea_freight", "reductionPct": round((1 - sea / air) * 100, 1)})

    edges_out = [{"from": e["from"], "to": e["to"], "share": e["share"]} for e in edges]

    payload = {
        "meta": {
            "company": "Modelled manufacturer, FY2025",
            "note": "Synthetic supply chain for prototype demonstration. Computed live on every request - nothing here is a cached export.",
            "suppliers": len(nodes),
            "relationships": len(edges_out),
        },
        "totals": {
            "tco2e": round(company_total_kgco2e / 1000, 1),
            "byCategory": {k: round(v, 1) for k, v in sorted(by_category.items())},
            "imputedShare": round(imputed_share_numer / imputed_share_denom, 4),
        },
        "blindSpot": {
            "index": blind_spot["blind_spot_index"],
            "band": blind_spot["band"],
            "lineCoverage": blind_spot["line_coverage"],
            "byTier": blind_spot["by_tier"],
            "worstOffenders": blind_spot["worst_offenders"],
        },
        "hotspots": [
            {k: n[k] for k in ("id", "name", "tier", "directTco2e", "shareOfTotal", "energyImputed")}
            for n in nodes[:10]
        ],
        "edges": edges_out,
        "nodes": nodes,
        "alternatives": alternatives,
        "imputeDiagnostics": impute_diagnostics,
    }
    return payload


def simulate_alternative(supplier_id, material_to=None, transport_to=None):
    """Live 'what-if' recompute for one supplier - Section 5 of the pipeline
    ('Act'): swap a material or freight mode and recompute its footprint
    against the same cited factors, no page reload."""
    suppliers = _read_csv("suppliers.csv")
    activity = _read_csv("supplier_activity.csv")
    factors = calculator.load_factors(os.path.join(DATA_DIR, "emission_factors.json"))

    if supplier_id not in suppliers:
        return None

    sup = suppliers[supplier_id]
    act = dict(activity[supplier_id])
    baseline_fp = calculator.calculate_supplier(sup, act, factors, energy_imputed=False)

    if material_to:
        act["material_type"] = material_to
    if transport_to:
        act["transport_mode"] = transport_to
    projected_fp = calculator.calculate_supplier(sup, act, factors, energy_imputed=False)

    return {
        "supplierId": supplier_id,
        "baselineTco2e": round(baseline_fp.direct_kgco2e / 1000, 2),
        "projectedTco2e": round(projected_fp.direct_kgco2e / 1000, 2),
        "abatedTco2e": round((baseline_fp.direct_kgco2e - projected_fp.direct_kgco2e) / 1000, 2),
        "projectedLines": projected_fp.lines,
    }
