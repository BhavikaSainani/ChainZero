"""
Gap imputation for unreported supplier energy.

There is no model to "train" in the deep-learning sense. This fits a small
gradient-boosting regressor on the suppliers that DID report, then predicts
energy for the ones that did not. It runs in about a second on a laptop,
needs no GPU, no cloud, and no external dataset.

Every imputed value is written back with quality = "imputed" so the
interface can mark it. It is never silently merged into measured data.

Run:  python impute.py
"""

import csv, json
import numpy as np
from sklearn.ensemble import GradientBoostingRegressor
from sklearn.model_selection import cross_val_score

from calculator import load_factors, calculate_supplier

F = load_factors()
suppliers = {r["supplier_id"]: r for r in csv.DictReader(open("data/suppliers.csv"))}
activity = {r["supplier_id"]: r for r in csv.DictReader(open("data/supplier_activity.csv"))}

MATERIALS = sorted({r["material_type"] for r in activity.values()})
MODES = sorted({r["transport_mode"] for r in activity.values()})
COUNTRIES = sorted({r["country"] for r in suppliers.values()})


def features(sid):
    """Predictors available even when energy is unreported: physical scale,
    spend, headcount, tier, and one-hot material / mode / country."""
    a, s = activity[sid], suppliers[sid]
    row = [
        float(a["material_mass_kg"]),
        float(a["annual_spend_usd"]),
        float(a["employee_count"]),
        float(a["transport_distance_km"]),
        float(s["tier"]),
    ]
    row += [1.0 if a["material_type"] == m else 0.0 for m in MATERIALS]
    row += [1.0 if a["transport_mode"] == m else 0.0 for m in MODES]
    row += [1.0 if s["country"] == c else 0.0 for c in COUNTRIES]
    return row


train_ids = [sid for sid in suppliers if activity[sid]["electricity_kwh"] != ""]
gap_ids = [sid for sid in suppliers if activity[sid]["electricity_kwh"] == ""]

X = np.array([features(sid) for sid in train_ids])
y = np.array([float(activity[sid]["electricity_kwh"]) for sid in train_ids])

model = GradientBoostingRegressor(n_estimators=300, max_depth=3,
                                  learning_rate=0.05, random_state=42)

# honest accuracy estimate, reported in the interface next to every estimate
r2 = cross_val_score(model, X, y, cv=5, scoring="r2")
mape = -cross_val_score(model, X, y, cv=5,
                        scoring="neg_mean_absolute_percentage_error")

model.fit(X, y)
preds = {sid: float(model.predict([features(sid)])[0]) for sid in gap_ids}

# recompute footprints with imputed values, flagged as such
out = []
for sid, sup in suppliers.items():
    act = dict(activity[sid])
    imputed = sid in preds
    if imputed:
        act["electricity_kwh"] = preds[sid]
    fp = calculate_supplier(sup, act, F).to_dict()
    if imputed:
        for line in fp["lines"]:
            if line["activity_unit"] == "kWh":
                line["data_quality"] = "imputed"
                line["formula"] += "  [energy estimated by model]"
    fp["energy_imputed"] = imputed
    out.append(fp)

json.dump(out, open("data/footprints_imputed.json", "w"), indent=1)

total = sum(f["direct_kgco2e"] for f in out)
hidden = sum(f["direct_kgco2e"] for f in out if f["energy_imputed"])
print(f"trained on         {len(train_ids)} reporting suppliers")
print(f"imputed            {len(gap_ids)} unreported energy values")
print(f"cross-val R2       {r2.mean():.3f} (+/- {r2.std():.3f})")
print(f"cross-val MAPE     {mape.mean():.1%}")
print(f"total with imputed {total/1000:,.0f} tCO2e")
print(f"of which estimated {hidden/1000:,.0f} tCO2e ({hidden/total:.1%})")
