"""Integration with existing database systems."""

from typing import Dict, List, Optional, Tuple

from rapidfuzz import fuzz, process
from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine

from .logging_utils import StructuredLogger
from .normalize import normalize_vendor_name


class ExistingDBIntegrator:
    """Integration with existing database systems."""
    
    def __init__(self, db_url: str, config: dict, logger: StructuredLogger):
        self.engine = create_engine(db_url) if db_url else None
        self.config = config
        self.logger = logger
        
        # Cache for existing data
        self._projects_cache: Optional[List[Dict]] = None
        self._vendors_cache: Optional[List[Dict]] = None
    
    def _load_existing_projects(self) -> List[Dict]:
        """Load existing projects from database."""
        if self._projects_cache is not None:
            return self._projects_cache
        
        if not self.engine:
            self._projects_cache = []
            return self._projects_cache
        
        try:
            table_name = self.config.get("existing_projects_table", "existing.projects")
            
            with self.engine.connect() as conn:
                result = conn.execute(
                    text(f"SELECT id, pjcd, name FROM {table_name}")
                )
                
                self._projects_cache = [
                    {
                        "id": row.id,
                        "pjcd": row.pjcd,
                        "name": row.name,
                    }
                    for row in result
                ]
                
        except Exception as e:
            self.logger.warning(f"Could not load existing projects: {e}")
            self._projects_cache = []
        
        self.logger.info(f"Loaded {len(self._projects_cache)} existing projects")
        return self._projects_cache
    
    def _load_existing_vendors(self) -> List[Dict]:
        """Load existing vendors from database."""
        if self._vendors_cache is not None:
            return self._vendors_cache
        
        if not self.engine:
            self._vendors_cache = []
            return self._vendors_cache
        
        try:
            table_name = self.config.get("existing_vendors_table", "existing.vendors")
            
            with self.engine.connect() as conn:
                result = conn.execute(
                    text(f"SELECT id, name FROM {table_name}")
                )
                
                self._vendors_cache = [
                    {
                        "id": row.id,
                        "name": row.name,
                    }
                    for row in result
                ]
                
        except Exception as e:
            self.logger.warning(f"Could not load existing vendors: {e}")
            self._vendors_cache = []
        
        self.logger.info(f"Loaded {len(self._vendors_cache)} existing vendors")
        return self._vendors_cache
    
    def match_project(self, pjcd: str) -> Optional[int]:
        """
        Match project by PJCD with existing projects.
        
        Args:
            pjcd: Project code to match
        
        Returns:
            Existing project ID if found, None otherwise
        """
        if not pjcd:
            return None
        
        existing_projects = self._load_existing_projects()
        
        # Exact match on PJCD
        for project in existing_projects:
            if project["pjcd"] and project["pjcd"].strip().upper() == pjcd.strip().upper():
                self.logger.debug(f"Project exact match found", pjcd=pjcd, existing_id=project["id"])
                return project["id"]
        
        self.logger.debug(f"No project match found for PJCD: {pjcd}")
        return None
    
    def match_vendor(self, vendor_name: str) -> Tuple[Optional[int], Optional[str], float]:
        """
        Match vendor name with existing vendors using exact and fuzzy matching.
        
        Args:
            vendor_name: Vendor name to match
        
        Returns:
            Tuple of (existing_vendor_id, matched_name, confidence_score)
        """
        if not vendor_name or not vendor_name.strip():
            return None, None, 0.0
        
        existing_vendors = self._load_existing_vendors()
        if not existing_vendors:
            return None, None, 0.0
        
        # Normalize the input name
        normalized_input = normalize_vendor_name(
            vendor_name, 
            self.config.get("vendor_normalize_patterns", [])
        )
        
        # Exact match first
        for vendor in existing_vendors:
            normalized_existing = normalize_vendor_name(
                vendor["name"],
                self.config.get("vendor_normalize_patterns", [])
            )
            
            if normalized_input == normalized_existing:
                self.logger.debug(
                    f"Vendor exact match found",
                    input_name=vendor_name,
                    matched_name=vendor["name"],
                    existing_id=vendor["id"]
                )
                return vendor["id"], vendor["name"], 100.0
        
        # Fuzzy matching if enabled
        if not self.config.get("enable_fuzzy_vendor_match", True):
            return None, None, 0.0
        
        threshold = self.config.get("fuzzy_threshold", 90)
        
        # Prepare choices for fuzzy matching
        choices = [(vendor["name"], vendor["id"]) for vendor in existing_vendors]
        choice_names = [choice[0] for choice in choices]
        
        # Use rapidfuzz for fuzzy matching
        matches = process.extract(
            normalized_input,
            choice_names,
            scorer=fuzz.ratio,
            limit=5
        )
        
        if matches and matches[0][1] >= threshold:
            best_match_name = matches[0][0]
            best_score = matches[0][1]
            
            # Find the corresponding vendor ID
            for vendor in existing_vendors:
                if vendor["name"] == best_match_name:
                    self.logger.debug(
                        f"Vendor fuzzy match found",
                        input_name=vendor_name,
                        matched_name=vendor["name"],
                        existing_id=vendor["id"],
                        score=best_score
                    )
                    return vendor["id"], vendor["name"], best_score
        
        # Log unmatched vendors for review
        self.logger.debug(
            f"No vendor match found",
            input_name=vendor_name,
            best_candidates=[match[0] for match in matches[:3]] if matches else []
        )
        
        return None, None, matches[0][1] if matches else 0.0


def generate_unmatched_report(vendors: List[Dict], integrator: ExistingDBIntegrator, output_path: str) -> None:
    """
    Generate CSV report of unmatched vendors with potential candidates.
    
    Args:
        vendors: List of vendor dictionaries
        integrator: Database integrator instance
        output_path: Path to save the report
    """
    import csv
    
    unmatched_vendors = []
    
    for vendor in vendors:
        vendor_name = vendor.get("vendor_name")
        if not vendor_name:
            continue
        
        existing_id, matched_name, score = integrator.match_vendor(vendor_name)
        
        if existing_id is None:
            # Get top 3 candidates for manual review
            existing_vendors = integrator._load_existing_vendors()
            if existing_vendors:
                choice_names = [v["name"] for v in existing_vendors]
                candidates = process.extract(
                    vendor_name,
                    choice_names,
                    scorer=fuzz.ratio,
                    limit=3
                )
                
                unmatched_vendors.append({
                    "input_vendor": vendor_name,
                    "normalized_vendor": normalize_vendor_name(
                        vendor_name,
                        integrator.config.get("vendor_normalize_patterns", [])
                    ),
                    "candidate_1": candidates[0][0] if len(candidates) > 0 else "",
                    "score_1": candidates[0][1] if len(candidates) > 0 else 0,
                    "candidate_2": candidates[1][0] if len(candidates) > 1 else "",
                    "score_2": candidates[1][1] if len(candidates) > 1 else 0,
                    "candidate_3": candidates[2][0] if len(candidates) > 2 else "",
                    "score_3": candidates[2][1] if len(candidates) > 2 else 0,
                })
    
    # Write CSV report
    if unmatched_vendors:
        with open(output_path, 'w', newline='', encoding='utf-8') as csvfile:
            fieldnames = [
                "input_vendor", "normalized_vendor",
                "candidate_1", "score_1",
                "candidate_2", "score_2", 
                "candidate_3", "score_3"
            ]
            writer = csv.DictWriter(csvfile, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(unmatched_vendors)
        
        integrator.logger.info(
            f"Unmatched vendors report generated: {output_path}",
            unmatched_count=len(unmatched_vendors)
        )