"""
FastAPI service for the Carbon-Aware Supply Chain Dashboard.

Every endpoint below runs the real pipeline (backend/pipeline.py) against
the CSV ledger in data/ - there is no pre-computed JSON checked into the
repo. Run with:  uvicorn backend.main:app --reload --port 8000
(from the repo root, so the relative data/ path resolves).
"""

import csv
import io

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from . import pipeline

app = FastAPI(title="ChainZero Carbon-Aware Supply Chain API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/dashboard")
def get_dashboard():
    """One aggregate call for the frontend's initial load - computed fresh
    every time, not served from a file."""
    return pipeline.run_pipeline()


@app.get("/api/nodes/{supplier_id}")
def get_node(supplier_id: str):
    data = pipeline.run_pipeline()
    node = next((n for n in data["nodes"] if n["id"] == supplier_id), None)
    if node is None:
        raise HTTPException(404, f"Unknown supplier {supplier_id}")
    return node


@app.post("/api/simulate")
def simulate(
    supplier_id: str = Query(...),
    material_to: str | None = Query(None),
    transport_to: str | None = Query(None),
):
    """Live recompute for the Circular Sourcing Hub - Section 5, 'Act'."""
    result = pipeline.simulate_alternative(supplier_id, material_to, transport_to)
    if result is None:
        raise HTTPException(404, f"Unknown supplier {supplier_id}")
    return result


@app.get("/api/export/audit.csv")
def export_audit_csv():
    """Auditor export - every audit line, for every supplier, with its
    cited factor and formula, as a flat CSV a third party can trace."""
    data = pipeline.run_pipeline()
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow([
        "supplier_id", "supplier_name", "tier", "country", "category",
        "activity_value", "activity_unit", "factor_value", "factor_unit",
        "factor_source", "factor_year", "factor_url", "formula", "kgco2e",
        "data_quality",
    ])
    for node in data["nodes"]:
        for line in node["auditLines"]:
            writer.writerow([
                node["id"], node["name"], node["tier"], node["country"],
                line["category"], line["activity_value"], line["activity_unit"],
                line["factor_value"], line["factor_unit"], line["factor_source"],
                line["factor_year"], line["factor_url"], line["formula"],
                line["kgco2e"], line["data_quality"],
            ])
    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=chainzero_audit_export.csv"},
    )


@app.get("/api/health")
def health():
    return {"status": "ok"}
