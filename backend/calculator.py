"""
Pure-function activity-based emissions engine.

Converts one supplier's reported activity (materials, energy, freight) into
GHG Protocol Scope 3 audit lines using versioned, cited emission factors.
No state, no I/O beyond the factor table handed in - safe to call per
request from the API layer.
"""

import json
from dataclasses import dataclass, field


def load_factors(path="data/emission_factors.json"):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def _fmt(n, decimals=1):
    return f"{n:,.{decimals}f}"


@dataclass
class Footprint:
    supplier_id: str
    lines: list = field(default_factory=list)

    @property
    def direct_kgco2e(self):
        return sum(l["kgco2e"] for l in self.lines)

    def to_dict(self):
        return {
            "supplier_id": self.supplier_id,
            "lines": self.lines,
            "direct_kgco2e": self.direct_kgco2e,
        }


def calculate_supplier(supplier, activity, factors, energy_imputed=False):
    """supplier: dict with country, tier. activity: dict with material_type,
    material_mass_kg, transport_mode, transport_distance_km, electricity_kwh
    (may be None/missing - caller fills gaps before calling, or omits the
    energy line entirely if truly unknown)."""

    fp = Footprint(supplier_id=supplier["supplier_id"])

    # --- Cat 1: Purchased goods and services (materials) -----------------
    material = activity["material_type"]
    mass_kg = float(activity["material_mass_kg"])
    mat_factor = factors["materials_kgco2e_per_kg"][material]
    mat_kgco2e = mass_kg * mat_factor["value"]
    fp.lines.append({
        "category": "Cat 1: Purchased goods and services",
        "activity_value": mass_kg,
        "activity_unit": "kg",
        "factor_value": mat_factor["value"],
        "factor_unit": "kgCO2e/kg",
        "factor_source": mat_factor["source"],
        "factor_year": mat_factor["year"],
        "factor_url": mat_factor["url"],
        "formula": f"{_fmt(mass_kg)} kg x {mat_factor['value']} kgCO2e/kg ({material})",
        "kgco2e": mat_kgco2e,
        "data_quality": "reported",
    })

    # --- Cat 3: Fuel and energy-related activities (electricity) --------
    kwh = activity.get("electricity_kwh")
    if kwh not in (None, ""):
        kwh = float(kwh)
        country = supplier["country"]
        elec_factor = factors["electricity_kgco2e_per_kwh"][country]
        energy_kgco2e = kwh * elec_factor["value"]
        formula = f"{_fmt(kwh)} kWh x {elec_factor['value']} kgCO2e/kWh"
        if energy_imputed:
            formula += "  [energy estimated by model]"
        fp.lines.append({
            "category": "Cat 3: Fuel and energy-related",
            "activity_value": kwh,
            "activity_unit": "kWh",
            "factor_value": elec_factor["value"],
            "factor_unit": "kgCO2e/kWh",
            "factor_source": elec_factor["source"],
            "factor_year": elec_factor["year"],
            "factor_url": elec_factor["url"],
            "formula": formula,
            "kgco2e": energy_kgco2e,
            "data_quality": "imputed" if energy_imputed else "reported",
        })

    # --- Cat 4: Upstream transportation and distribution -----------------
    mode = activity["transport_mode"]
    distance_km = float(activity["transport_distance_km"])
    trans_factor = factors["transport_kgco2e_per_tonne_km"][mode]
    tonne_km = (mass_kg / 1000.0) * distance_km
    trans_kgco2e = tonne_km * trans_factor["value"]
    fp.lines.append({
        "category": "Cat 4: Upstream transportation",
        "activity_value": tonne_km,
        "activity_unit": "tonne-km",
        "factor_value": trans_factor["value"],
        "factor_unit": "kgCO2e/tonne-km",
        "factor_source": trans_factor["source"],
        "factor_year": trans_factor["year"],
        "factor_url": trans_factor["url"],
        "formula": f"({_fmt(mass_kg)} kg / 1000) x {_fmt(distance_km)} km x {trans_factor['value']} kgCO2e/tonne-km ({mode})",
        "kgco2e": trans_kgco2e,
        "data_quality": "reported",
    })

    return fp


def circular_alternative(material, factors):
    return factors["materials_kgco2e_per_kg"].get(material, {}).get("circular_alternative")
