"""
Gap imputation for unreported supplier energy.

There is no model to "train" in the deep-learning sense. This fits a small
gradient-boosting regressor on the suppliers that DID report electricity,
then predicts energy for the ones that did not. Runs in under a second,
needs no GPU. Every imputed value is flagged data_quality="imputed" so the
interface can mark it - it is never silently merged with measured data.
"""

import numpy as np
from sklearn.ensemble import GradientBoostingRegressor
from sklearn.model_selection import cross_val_score


def _features(sid, suppliers, activity, materials, modes, countries):
    a, s = activity[sid], suppliers[sid]
    row = [
        float(a["material_mass_kg"]),
        float(a["annual_spend_usd"]),
        float(a["employee_count"]),
        float(a["transport_distance_km"]),
        float(s["tier"]),
    ]
    row += [1.0 if a["material_type"] == m else 0.0 for m in materials]
    row += [1.0 if a["transport_mode"] == m else 0.0 for m in modes]
    row += [1.0 if s["country"] == c else 0.0 for c in countries]
    return row


def impute_missing_energy(suppliers, activity, with_diagnostics=True):
    """suppliers/activity: {supplier_id: dict}, as loaded from the CSVs.
    Returns (predictions: {supplier_id: kwh}, diagnostics: dict) for every
    supplier whose electricity_kwh is blank. Set with_diagnostics=False to
    skip the cross-validation pass (used by the calibration search, which
    calls this dozens of times and only needs the point predictions)."""
    materials = sorted({r["material_type"] for r in activity.values()})
    modes = sorted({r["transport_mode"] for r in activity.values()})
    countries = sorted({r["country"] for r in suppliers.values()})

    train_ids = [sid for sid in suppliers if activity[sid]["electricity_kwh"] not in ("", None)]
    gap_ids = [sid for sid in suppliers if activity[sid]["electricity_kwh"] in ("", None)]

    if not gap_ids:
        return {}, {"trained_on": len(train_ids), "imputed": 0, "r2": None, "mape": None}

    X = np.array([_features(sid, suppliers, activity, materials, modes, countries) for sid in train_ids])
    y = np.array([float(activity[sid]["electricity_kwh"]) for sid in train_ids])

    model = GradientBoostingRegressor(
        n_estimators=300, max_depth=3, learning_rate=0.05, random_state=42
    )

    diagnostics = {"trained_on": len(train_ids), "imputed": len(gap_ids)}
    if with_diagnostics and len(train_ids) >= 10:
        r2 = cross_val_score(model, X, y, cv=5, scoring="r2")
        mape = -cross_val_score(model, X, y, cv=5, scoring="neg_mean_absolute_percentage_error")
        diagnostics["r2_mean"] = float(r2.mean())
        diagnostics["mape_mean"] = float(mape.mean())

    model.fit(X, y)
    preds = {
        sid: float(model.predict([_features(sid, suppliers, activity, materials, modes, countries)])[0])
        for sid in gap_ids
    }
    return preds, diagnostics
