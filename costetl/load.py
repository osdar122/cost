"""Data loading and database operations."""

import json
from typing import Any, Dict, List, Optional

from sqlalchemy import (
    Boolean, Column, DateTime, MetaData, Numeric, String, Table, Text,
    BigInteger, Date, CheckConstraint, ForeignKey, UniqueConstraint,
    create_engine, text
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

from .integrate import ExistingDBIntegrator
from .logging_utils import StructuredLogger
from .normalize import normalize_vendor_name


class DatabaseLoader:
    """Database operations for cost ETL."""
    
    def __init__(self, db_url: str, schema_name: str, logger: StructuredLogger):
        self.engine = create_engine(db_url)
        self.schema_name = schema_name
        self.logger = logger
        self.metadata = MetaData()
        
        # Create session factory
        self.SessionLocal = sessionmaker(bind=self.engine)
        
        # Define tables
        self._define_tables()
    
    def _define_tables(self) -> None:
        """Define database table structures."""
        # Staging table
        self.stg_cost_rows = Table(
            'stg_cost_rows',
            self.metadata,
            Column('stg_id', BigInteger, primary_key=True, autoincrement=True),
            Column('source_file', Text, nullable=False),
            Column('source_row', BigInteger, nullable=False),
            Column('pjcd', Text),
            Column('project_name', Text),
            Column('address', Text),
            Column('ac_kw', Numeric),
            Column('dc_kw', Numeric),
            Column('meta_json', JSONB),
            Column('account_code', Text),
            Column('account_name', Text),
            Column('vendor_name_raw', Text),
            Column('budget_amount_jpy', Numeric),
            Column('budget_date', Date),
            Column('actual_plan_amount_jpy', Numeric),
            Column('actual_plan_date', Date),
            Column('confirmed_amount_jpy', Numeric),
            Column('confirmed_date', Date),
            Column('payment_date', Date),
            Column('notes', Text),
            Column('delivery_date', Date),
            Column('po_number', Text),
            Column('load_ts', DateTime(timezone=True), server_default=text('CURRENT_TIMESTAMP')),
            Column('source_hash', String(64), nullable=False, unique=True),
            schema=self.schema_name
        )
        
        # Dimension tables
        self.dim_project = Table(
            'dim_project',
            self.metadata,
            Column('project_id', BigInteger, primary_key=True, autoincrement=True),
            Column('pjcd', Text, unique=True),
            Column('project_name', Text),
            Column('address', Text),
            Column('ac_kw', Numeric),
            Column('dc_kw', Numeric),
            Column('existing_project_id', BigInteger),
            schema=self.schema_name
        )
        
        self.dim_account = Table(
            'dim_account',
            self.metadata,
            Column('account_id', BigInteger, primary_key=True, autoincrement=True),
            Column('account_code', Text, nullable=False, unique=True),
            Column('account_name', Text),
            Column('parent_code', Text),
            schema=self.schema_name
        )
        
        self.dim_vendor = Table(
            'dim_vendor',
            self.metadata,
            Column('vendor_id', BigInteger, primary_key=True, autoincrement=True),
            Column('vendor_name', Text, nullable=False),
            Column('normalized_name', Text),
            Column('existing_vendor_id', BigInteger),
            UniqueConstraint('vendor_name', 'normalized_name', name='uk_vendor_names'),
            schema=self.schema_name
        )
        
        # Fact table
        self.fct_cost = Table(
            'fct_cost',
            self.metadata,
            Column('cost_id', BigInteger, primary_key=True, autoincrement=True),
            Column('project_id', BigInteger, ForeignKey(f'{self.schema_name}.dim_project.project_id'), nullable=False),
            Column('account_id', BigInteger, ForeignKey(f'{self.schema_name}.dim_account.account_id'), nullable=False),
            Column('vendor_id', BigInteger, ForeignKey(f'{self.schema_name}.dim_vendor.vendor_id')),
            Column('measure', Text, nullable=False),
            Column('amount_jpy', Numeric, nullable=False),
            Column('event_date', Date),
            Column('payment_date', Date),
            Column('notes', Text),
            Column('source_file', Text, nullable=False),
            Column('source_row', BigInteger, nullable=False),
            Column('source_hash', String(64), nullable=False),
            Column('load_ts', DateTime(timezone=True), server_default=text('CURRENT_TIMESTAMP')),
            CheckConstraint("measure IN ('budget', 'actual_or_plan', 'confirmed')", name='ck_measure'),
            UniqueConstraint('source_hash', 'measure', name='uk_source_measure'),
            schema=self.schema_name
        )
    
    def create_schema_and_tables(self) -> None:
        """Create database schema and tables."""
        try:
            # Create schema if it doesn't exist
            with self.engine.connect() as conn:
                conn.execute(text(f"CREATE SCHEMA IF NOT EXISTS {self.schema_name}"))
                conn.commit()
            
            # Create tables
            self.metadata.create_all(self.engine)
            
            # Create view
            self._create_view()
            
            self.logger.info(f"Database schema '{self.schema_name}' and tables created successfully")
            
        except Exception as e:
            self.logger.error(f"Error creating database schema: {e}")
            raise
    
    def _create_view(self) -> None:
        """Create cost view with existing system joins."""
        view_sql = f"""
        CREATE OR REPLACE VIEW {self.schema_name}.vw_cost_with_existing AS
        SELECT
            f.cost_id,
            f.measure,
            f.amount_jpy,
            f.event_date,
            f.payment_date,
            f.notes,
            p.pjcd,
            COALESCE(p.existing_project_id::text, 'NULL') as existing_project_id,
            a.account_code,
            a.account_name,
            v.vendor_name,
            COALESCE(v.existing_vendor_id::text, 'NULL') as existing_vendor_id,
            f.source_file,
            f.source_row,
            f.load_ts
        FROM {self.schema_name}.fct_cost f
        JOIN {self.schema_name}.dim_project p ON f.project_id = p.project_id
        JOIN {self.schema_name}.dim_account a ON f.account_id = a.account_id
        LEFT JOIN {self.schema_name}.dim_vendor v ON f.vendor_id = v.vendor_id
        """
        
        with self.engine.connect() as conn:
            conn.execute(text(view_sql))
            conn.commit()
    
    def upsert_project(self, session: Session, project_data: Dict, integrator: Optional[ExistingDBIntegrator] = None) -> int:
        """Upsert project dimension and return project_id."""
        pjcd = project_data.get("pjcd")
        
        if not pjcd:
            raise ValueError("PJCD is required for project")
        
        # Check if project exists
        existing = session.execute(
            text(f"SELECT project_id FROM {self.schema_name}.dim_project WHERE pjcd = :pjcd"),
            {"pjcd": pjcd}
        ).first()
        
        if existing:
            project_id = existing.project_id
            self.logger.debug(f"Project found", pjcd=pjcd, project_id=project_id)
        else:
            # Insert new project
            existing_project_id = None
            if integrator:
                existing_project_id = integrator.match_project(pjcd)
            
            insert_data = {
                "pjcd": pjcd,
                "project_name": project_data.get("project_name"),
                "address": project_data.get("address"),
                "ac_kw": project_data.get("ac_kw"),
                "dc_kw": project_data.get("dc_kw"),
                "existing_project_id": existing_project_id,
            }
            
            result = session.execute(
                text(f"""
                    INSERT INTO {self.schema_name}.dim_project 
                    (pjcd, project_name, address, ac_kw, dc_kw, existing_project_id)
                    VALUES (:pjcd, :project_name, :address, :ac_kw, :dc_kw, :existing_project_id)
                    RETURNING project_id
                """),
                insert_data
            )
            
            project_id = result.scalar()
            self.logger.debug(f"Project inserted", pjcd=pjcd, project_id=project_id)
        
        return project_id
    
    def upsert_account(self, session: Session, account_data: Dict) -> int:
        """Upsert account dimension and return account_id."""
        account_code = account_data.get("account_code")
        
        if not account_code:
            raise ValueError("Account code is required")
        
        # Check if account exists
        existing = session.execute(
            text(f"SELECT account_id FROM {self.schema_name}.dim_account WHERE account_code = :account_code"),
            {"account_code": account_code}
        ).first()
        
        if existing:
            return existing.account_id
        
        # Insert new account
        insert_data = {
            "account_code": account_code,
            "account_name": account_data.get("account_name"),
            "parent_code": account_data.get("parent_code"),
        }
        
        result = session.execute(
            text(f"""
                INSERT INTO {self.schema_name}.dim_account 
                (account_code, account_name, parent_code)
                VALUES (:account_code, :account_name, :parent_code)
                RETURNING account_id
            """),
            insert_data
        )
        
        return result.scalar()
    
    def upsert_vendor(self, session: Session, vendor_data: Dict, config: Dict, integrator: Optional[ExistingDBIntegrator] = None) -> Optional[int]:
        """Upsert vendor dimension and return vendor_id."""
        vendor_name = vendor_data.get("vendor_name")
        
        if not vendor_name or not vendor_name.strip():
            return None
        
        # Normalize vendor name
        normalized_name = normalize_vendor_name(vendor_name, config.get("vendor_normalize_patterns", []))
        
        # Check if vendor exists
        existing = session.execute(
            text(f"""
                SELECT vendor_id FROM {self.schema_name}.dim_vendor 
                WHERE vendor_name = :vendor_name 
                AND COALESCE(normalized_name, '') = COALESCE(:normalized_name, '')
            """),
            {"vendor_name": vendor_name, "normalized_name": normalized_name}
        ).first()
        
        if existing:
            return existing.vendor_id
        
        # Match with existing system
        existing_vendor_id = None
        if integrator:
            existing_vendor_id, _, _ = integrator.match_vendor(vendor_name)
        
        # Insert new vendor
        insert_data = {
            "vendor_name": vendor_name,
            "normalized_name": normalized_name if normalized_name != vendor_name else None,
            "existing_vendor_id": existing_vendor_id,
        }
        
        result = session.execute(
            text(f"""
                INSERT INTO {self.schema_name}.dim_vendor 
                (vendor_name, normalized_name, existing_vendor_id)
                VALUES (:vendor_name, :normalized_name, :existing_vendor_id)
                RETURNING vendor_id
            """),
            insert_data
        )
        
        return result.scalar()
    
    def load_facts(
        self,
        facts: List[Dict],
        project_data: Dict,
        accounts: List[Dict],
        vendors: List[Dict],
        config: Dict,
        integrator: Optional[ExistingDBIntegrator] = None
    ) -> Dict[str, Any]:
        """Load fact data into database."""
        summary = {
            "total_facts": len(facts),
            "loaded_facts": 0,
            "skipped_facts": 0,
            "errors": 0
        }
        
        try:
            with self.SessionLocal() as session:
                # Upsert dimensions first
                project_id = self.upsert_project(session, project_data, integrator)
                
                # Create account lookup
                account_lookup = {}
                for account in accounts:
                    account_id = self.upsert_account(session, account)
                    account_lookup[account["account_code"]] = account_id
                
                # Create vendor lookup
                vendor_lookup = {}
                for vendor in vendors:
                    vendor_id = self.upsert_vendor(session, vendor, config, integrator)
                    if vendor_id:
                        vendor_lookup[vendor["vendor_name"]] = vendor_id
                
                session.commit()
                
                # Load facts
                for fact in facts:
                    try:
                        account_id = account_lookup.get(fact["account_code"])
                        vendor_id = vendor_lookup.get(fact["vendor_name"]) if fact.get("vendor_name") else None
                        
                        if not account_id:
                            self.logger.warning(f"Account not found for fact", account_code=fact["account_code"])
                            summary["errors"] += 1
                            continue
                        
                        # Check if fact already exists
                        existing = session.execute(
                            text(f"""
                                SELECT cost_id FROM {self.schema_name}.fct_cost 
                                WHERE source_hash = :source_hash AND measure = :measure
                            """),
                            {"source_hash": fact["source_hash"], "measure": fact["measure"]}
                        ).first()
                        
                        if existing:
                            summary["skipped_facts"] += 1
                            continue
                        
                        # Insert fact
                        insert_data = {
                            "project_id": project_id,
                            "account_id": account_id,
                            "vendor_id": vendor_id,
                            "measure": fact["measure"],
                            "amount_jpy": fact["amount_jpy"],
                            "event_date": fact["event_date"],
                            "payment_date": fact["payment_date"],
                            "notes": fact["notes"],
                            "source_file": fact["source_file"],
                            "source_row": fact["source_row"],
                            "source_hash": fact["source_hash"],
                        }
                        
                        session.execute(
                            text(f"""
                                INSERT INTO {self.schema_name}.fct_cost 
                                (project_id, account_id, vendor_id, measure, amount_jpy, 
                                 event_date, payment_date, notes, source_file, source_row, source_hash)
                                VALUES (:project_id, :account_id, :vendor_id, :measure, :amount_jpy, 
                                        :event_date, :payment_date, :notes, :source_file, :source_row, :source_hash)
                            """),
                            insert_data
                        )
                        
                        summary["loaded_facts"] += 1
                        
                    except Exception as e:
                        self.logger.error(f"Error loading fact", error=str(e), fact=fact)
                        summary["errors"] += 1
                
                session.commit()
                
        except Exception as e:
            self.logger.error(f"Error in load_facts: {e}")
            raise
        
        self.logger.info("Fact loading complete", summary=summary)
        return summary