"""Data transformation for cost data."""

from typing import Any, Dict, List, Tuple

import pandas as pd

from .config import MEASURE_MAP
from .logging_utils import StructuredLogger
from .normalize import to_date, to_number, extract_account_hierarchy


def melt_measures(row: pd.Series, measure_map: List[Tuple[str, str, str]]) -> List[Dict[str, Any]]:
    """
    Convert wide format row to narrow format with multiple measures.
    
    Args:
        row: DataFrame row containing multiple amount/date columns
        measure_map: List of (measure_name, amount_column, date_column) tuples
    
    Returns:
        List of measure dictionaries
    """
    events = []
    
    for measure, amount_col, date_col in measure_map:
        amount = to_number(row.get(amount_col))
        
        # Skip if amount is None or zero
        if amount is None or amount == 0:
            continue
        
        event_date = to_date(row.get(date_col))
        payment_date = to_date(row.get("請求書__支払日"))
        
        events.append({
            "measure": measure,
            "amount_jpy": amount,
            "event_date": event_date,
            "payment_date": payment_date,
            "notes": combine_notes(row),
            "source_file": row.get("source_file"),
            "source_row": row.get("source_row"),
            "source_hash": row.get("source_hash"),
        })
    
    return events


def combine_notes(row: pd.Series) -> str:
    """
    Combine multiple notes columns into a single notes field.
    
    Args:
        row: DataFrame row
    
    Returns:
        Combined notes string
    """
    notes_parts = []
    
    # Check various notes columns
    for col in ["備考", "notes", "notes2", "AF契約", "af_contract"]:
        value = row.get(col)
        if value is not None and pd.notna(value) and str(value).strip() != 'nan':
            notes_parts.append(str(value).strip())
    
    return " | ".join(notes_parts) if notes_parts else ""


def extract_dimensions(
    df: pd.DataFrame, 
    project_meta: Dict[str, Any],
    logger: StructuredLogger
) -> Tuple[List[Dict], List[Dict], List[Dict]]:
    """
    Extract dimension data from processed DataFrame.
    
    Args:
        df: Processed DataFrame with detail rows
        project_meta: Project metadata from Excel header
        logger: Logger instance
    
    Returns:
        Tuple of (projects, accounts, vendors) dimension lists
    """
    # Extract project dimension
    projects = []
    if project_meta:
        project = {
            "pjcd": project_meta.get("PJCD"),
            "project_name": project_meta.get("案件名"),
            "address": project_meta.get("住所"),
            "ac_kw": to_number(project_meta.get("AC")),
            "dc_kw": to_number(project_meta.get("DC")),
            "meta_json": project_meta,
        }
        # Only add if we have at least a PJCD
        if project["pjcd"]:
            projects.append(project)
    
    # Extract account dimensions
    accounts = []
    account_codes = df["項目CD"].dropna().unique()
    
    for code in account_codes:
        if pd.notna(code) and str(code).strip():
            account_name = df[df["項目CD"] == code]["内容"].iloc[0] if len(df[df["項目CD"] == code]) > 0 else None
            
            accounts.append({
                "account_code": str(code).strip(),
                "account_name": str(account_name).strip() if pd.notna(account_name) else None,
                "parent_code": extract_account_hierarchy(str(code).strip()),
            })
    
    # Extract vendor dimensions
    vendors = []
    vendor_names = df["協力会社__売上げの場合：売り先\\n仕入れの場合：仕入れ先"].dropna().unique()
    
    for name in vendor_names:
        if pd.notna(name) and str(name).strip() != 'nan' and str(name).strip():
            vendors.append({
                "vendor_name": str(name).strip(),
            })
    
    logger.info(
        f"Extracted dimensions",
        projects=len(projects),
        accounts=len(accounts),
        vendors=len(vendors)
    )
    
    return projects, accounts, vendors


def transform_to_facts(
    df: pd.DataFrame,
    logger: StructuredLogger
) -> List[Dict[str, Any]]:
    """
    Transform wide-format data to narrow fact table format.
    
    Args:
        df: Processed DataFrame with detail rows
        logger: Logger instance
    
    Returns:
        List of fact records
    """
    facts = []
    
    for idx, row in df.iterrows():
        # Get base row information
        account_code = str(row.get("項目CD", "")).strip()
        vendor_name = row.get("協力会社__売上げの場合：売り先\\n仕入れの場合：仕入れ先")
        
        if pd.notna(vendor_name):
            vendor_name = str(vendor_name).strip()
        else:
            vendor_name = None
        
        # Extract measures from the row
        measures = melt_measures(row, MEASURE_MAP)
        
        for measure_data in measures:
            fact = {
                "account_code": account_code,
                "vendor_name": vendor_name,
                **measure_data
            }
            facts.append(fact)
    
    logger.info(f"Generated {len(facts)} fact records from {len(df)} source rows")
    
    return facts


def validate_transformed_data(facts: List[Dict], expected_totals: Dict[str, float], logger: StructuredLogger) -> bool:
    """
    Validate transformed data against expected totals.
    
    Args:
        facts: List of fact records
        expected_totals: Dictionary of measure -> expected_total
        logger: Logger instance
    
    Returns:
        True if validation passes
    """
    # Calculate actual totals by measure
    actual_totals = {}
    for fact in facts:
        measure = fact["measure"]
        amount = fact["amount_jpy"]
        
        if measure not in actual_totals:
            actual_totals[measure] = 0
        actual_totals[measure] += amount
    
    # Compare with expected totals
    validation_passed = True
    
    for measure, expected in expected_totals.items():
        actual = actual_totals.get(measure, 0)
        difference = abs(actual - expected)
        tolerance = expected * 0.001  # 0.1% tolerance
        
        if difference > tolerance:
            logger.error(
                f"Validation failed for measure {measure}",
                expected=expected,
                actual=actual,
                difference=difference
            )
            validation_passed = False
        else:
            logger.info(
                f"Validation passed for measure {measure}",
                expected=expected,
                actual=actual
            )
    
    return validation_passed