"""FastAPI backend for the DB-resident editable cost report."""

from __future__ import annotations

from datetime import date
from typing import List, Optional

from fastapi import FastAPI, HTTPException, Depends, Header
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from .db import SessionLocal, init_db, Project, ProjectMilestone, CostReport, CostItem, Vendor


app = FastAPI(title="Cost Edit-mode API", version="0.1.0")


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@app.on_event("startup")
def on_startup():
    init_db()


# Schemas
class ProjectUpdate(BaseModel):
    pj_code: Optional[str] = None
    pj_identifier: Optional[str] = None
    name: Optional[str] = None
    address: Optional[str] = None
    fit: Optional[str] = None
    kubun: Optional[str] = None
    capacity_dc_kw: Optional[float] = None
    capacity_ac_kw: Optional[float] = None
    module_model: Optional[str] = None
    pcs_model: Optional[str] = None


class Milestone(BaseModel):
    id: Optional[int] = None
    label: str
    due_date: Optional[date]
    memo: Optional[str] = None


class CostItemPatch(BaseModel):
    title: Optional[str] = None
    vendor_id: Optional[int] = None
    actual_planned_amount: Optional[int] = None
    actual_planned_date: Optional[date] = None
    confirmed_amount: Optional[int] = None
    confirmed_date: Optional[date] = None
    payment_date: Optional[date] = None
    delivery_date: Optional[date] = None
    po_number: Optional[str] = None
    note: Optional[str] = None


def validate_business(item: CostItemPatch):
    if item.confirmed_date and item.payment_date and item.payment_date < item.confirmed_date:
        raise HTTPException(status_code=422, detail=[{"field": "payment_date", "message": "must be on/after confirmed_date"}])
    if item.delivery_date and item.confirmed_date and item.delivery_date > item.confirmed_date:
        raise HTTPException(status_code=422, detail=[{"field": "delivery_date", "message": "must be on/before confirmed_date"}])
    for amt_field in ["actual_planned_amount", "confirmed_amount"]:
        val = getattr(item, amt_field)
        if val is not None and val < 0:
            raise HTTPException(status_code=422, detail=[{"field": amt_field, "message": "must be >= 0"}])


@app.get("/projects/{project_id}")
def get_project(project_id: int, db: Session = Depends(get_db)):
    proj = db.query(Project).get(project_id)
    if not proj:
        raise HTTPException(status_code=404)
    return {
        "id": proj.id,
        "pj_code": proj.pj_code,
        "name": proj.name,
        "address": proj.address,
        "fit": proj.fit,
        "kubun": proj.kubun,
        "capacity_dc_kw": float(proj.capacity_dc_kw) if proj.capacity_dc_kw is not None else None,
        "capacity_ac_kw": float(proj.capacity_ac_kw) if proj.capacity_ac_kw is not None else None,
        "module_model": proj.module_model,
        "pcs_model": proj.pcs_model,
        "updated_at": proj.updated_at,
    }


@app.patch("/projects/{project_id}")
def patch_project(project_id: int, payload: ProjectUpdate, db: Session = Depends(get_db)):
    proj = db.query(Project).get(project_id)
    if not proj:
        raise HTTPException(status_code=404)
    for k, v in payload.dict(exclude_unset=True).items():
        setattr(proj, k, v)
    db.commit()
    return {"project_id": proj.id}


@app.get("/projects/{project_id}/milestones", response_model=List[Milestone])
def list_milestones(project_id: int, db: Session = Depends(get_db)):
    return [Milestone(id=m.id, label=m.label, due_date=m.due_date, memo=m.memo) for m in db.query(ProjectMilestone).filter_by(project_id=project_id).all()]


@app.post("/projects/{project_id}/milestones")
def add_milestone(project_id: int, payload: Milestone, db: Session = Depends(get_db)):
    m = ProjectMilestone(project_id=project_id, label=payload.label, due_date=payload.due_date, memo=payload.memo)
    db.add(m)
    db.commit()
    return {"id": m.id}


@app.patch("/projects/{project_id}/cost-items/{item_id}")
def patch_cost_item(project_id: int, item_id: int, payload: CostItemPatch, db: Session = Depends(get_db), if_match: Optional[int] = Header(None, convert_underscores=False)):
    validate_business(payload)
    item = db.query(CostItem).get(item_id)
    if not item or item.project_id != project_id:
        raise HTTPException(status_code=404)
    # optimistic lock
    if if_match is not None and item.row_version != if_match:
        raise HTTPException(status_code=409, detail={"row_version": item.row_version})
    for k, v in payload.dict(exclude_unset=True).items():
        setattr(item, k, v)
    item.row_version = (item.row_version or 1) + 1
    db.commit()
    return {"item_id": item.id, "row_version": item.row_version, "recalculated": True}


@app.post("/projects/{project_id}/cost-report/recalculate")
def recalc_report(project_id: int, db: Session = Depends(get_db)):
    # Minimal stub: in a real impl, recompute aggregates for the latest report
    return {"project_id": project_id, "status": "ok"}
