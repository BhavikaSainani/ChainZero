"""
The Blind Spot Index (BSI).

Line-item coverage (are the numbers complete) is not the same question as
assurance (can the numbers be trusted). BSI answers the second one: the
share of procurement spend running through suppliers that never reported
their own activity data, regardless of whether a model has since filled
the gap. A high line-coverage number next to a high BSI is the signal that
matters - it means gaps are being patched by estimation, not measurement.
"""


def _band(bsi):
    if bsi >= 0.30:
        return "Weak"
    if bsi >= 0.15:
        return "Moderate"
    return "Strong"


def compute_blind_spot(suppliers, footprints_by_id, imputed_line_count, total_line_count, has_gap):
    """has_gap: {supplier_id: bool} - True where any activity line (in
    practice, energy) had to be estimated rather than measured. This, not
    the coarser self-declared reports_data flag, is what actually drives
    the index: a supplier can tick 'yes, we report' and still have gaps
    in what it submitted."""
    total_spend = sum(float(s["annual_spend_usd"]) for s in suppliers.values())
    gap_spend = sum(
        float(s["annual_spend_usd"]) for sid, s in suppliers.items() if has_gap.get(sid)
    )
    bsi = gap_spend / total_spend if total_spend else 0.0

    by_tier = {}
    for tier in sorted({int(s["tier"]) for s in suppliers.values()}):
        tier_suppliers = {sid: s for sid, s in suppliers.items() if int(s["tier"]) == tier}
        tier_spend = sum(float(s["annual_spend_usd"]) for s in tier_suppliers.values())
        tier_gap_spend = sum(
            float(s["annual_spend_usd"]) for sid, s in tier_suppliers.items() if has_gap.get(sid)
        )
        by_tier[str(tier)] = {
            "bsi": (tier_gap_spend / tier_spend) if tier_spend else 0.0,
            "suppliers": len(tier_suppliers),
            "suppliers_with_gaps": sum(1 for sid in tier_suppliers if has_gap.get(sid)),
        }

    non_reporting = [s for sid, s in suppliers.items() if has_gap.get(sid)]
    non_reporting.sort(key=lambda s: -float(s["annual_spend_usd"]))
    worst_offenders = [
        {
            "supplier_id": s["supplier_id"],
            "name": s["name"],
            "tier": int(s["tier"]),
            "spend_usd": float(s["annual_spend_usd"]),
            "direct_tco2e": round(footprints_by_id.get(s["supplier_id"], 0.0) / 1000, 2),
        }
        for s in non_reporting[:10]
    ]

    line_coverage = 1 - (imputed_line_count / total_line_count) if total_line_count else 1.0

    return {
        "blind_spot_index": round(bsi, 4),
        "band": _band(bsi),
        "line_coverage": round(line_coverage, 4),
        "by_tier": by_tier,
        "worst_offenders": worst_offenders,
    }
