"""SQLAlchemy engine and models for edit-mode backend."""

from __future__ import annotations

from datetime import datetime, date
from typing import Optional

from sqlalchemy import (
    BigInteger, Boolean, Column, Date, DateTime, Enum, ForeignKey, Integer, Numeric, String, Text,
    create_engine
)
from sqlalchemy.orm import declarative_base, relationship, sessionmaker


DATABASE_URL = "sqlite:///./edit_mode.db"  # default local; can be overridden via env later

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
Base = declarative_base()


class Project(Base):
    __tablename__ = "projects"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    pj_code = Column(String(255), unique=True, index=True)
    pj_identifier = Column(String(255))
    name = Column(String(255))
    address = Column(String(255))
    fit = Column(String(255))
    kubun = Column(String(255))
    capacity_dc_kw = Column(Numeric)
    capacity_ac_kw = Column(Numeric)
    module_model = Column(String(255))
    pcs_model = Column(String(255))
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    milestones = relationship("ProjectMilestone", back_populates="project", cascade="all, delete-orphan")
    reports = relationship("CostReport", back_populates="project", cascade="all, delete-orphan")


class ProjectMilestone(Base):
    __tablename__ = "project_milestones"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    project_id = Column(BigInteger, ForeignKey("projects.id"), nullable=False, index=True)
    label = Column(String(255), nullable=False)
    due_date = Column(Date, nullable=True)
    memo = Column(Text)

    project = relationship("Project", back_populates="milestones")


class CostReport(Base):
    __tablename__ = "cost_reports"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    project_id = Column(BigInteger, ForeignKey("projects.id"), nullable=False, index=True)
    version = Column(Integer, default=1)
    status = Column(String(32), default="draft")  # draft|in_review|approved|locked
    created_at = Column(DateTime, default=datetime.utcnow)
    closed_at = Column(DateTime, nullable=True)

    project = relationship("Project", back_populates="reports")
    items = relationship("CostItem", back_populates="report", cascade="all, delete-orphan")


class Vendor(Base):
    __tablename__ = "vendors"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    name = Column(String(255), nullable=False, unique=True)
    code = Column(String(255))


class CostItem(Base):
    __tablename__ = "cost_items"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    project_id = Column(BigInteger, ForeignKey("projects.id"), nullable=False, index=True)
    report_id = Column(BigInteger, ForeignKey("cost_reports.id"), nullable=False, index=True)
    code = Column(String(255), index=True)
    title = Column(String(255))
    vendor_id = Column(BigInteger, ForeignKey("vendors.id"), nullable=True)

    budget_amount = Column(BigInteger)
    budget_unit_price = Column(BigInteger)
    budget_date = Column(Date)

    actual_planned_amount = Column(BigInteger)
    actual_planned_date = Column(Date)

    confirmed_amount = Column(BigInteger)
    confirmed_date = Column(Date)

    payment_date = Column(Date)
    af_contract_flag = Column(Boolean)
    af_contract_id = Column(BigInteger, nullable=True)
    note = Column(Text)
    delivery_date = Column(Date)
    po_number = Column(String(255))

    is_aggregate_row = Column(Boolean, default=False)
    parent_id = Column(BigInteger, ForeignKey("cost_items.id"), nullable=True)
    sort_order = Column(Integer, default=0)
    row_state = Column(String(32), default="active")
    row_version = Column(BigInteger, default=1)

    report = relationship("CostReport", back_populates="items")
    vendor = relationship("Vendor")
    parent = relationship("CostItem", remote_side=[id])


def init_db() -> None:
    Base.metadata.create_all(bind=engine)
