"""Excel file processing and header detection."""

import hashlib
import re
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import pandas as pd
from dateutil import parser as date_parser

from .logging_utils import StructuredLogger
from .normalize import normalize_column_name, to_date, to_number


def detect_headers(df: pd.DataFrame, logger: StructuredLogger) -> Tuple[int, List[str]]:
    """
    Detect header rows in Excel data and return data start row and column names.
    
    Args:
        df: Raw DataFrame from Excel
        logger: Logger instance
    
    Returns:
        Tuple of (data_start_row, normalized_column_names)
    """
    key_words = ["項目CD", "内容", "協力会社", "予算", "現時点", "確定", "請求", "金額", "日付", "支払"]
    
    # Find row with at least 2 keywords
    header_row_idx = None
    for idx in range(min(20, len(df))):  # Check first 20 rows
        row_text = " ".join(str(cell) for cell in df.iloc[idx].values if pd.notna(cell))
        keyword_count = sum(1 for kw in key_words if kw in row_text)
        
        if keyword_count >= 2:
            header_row_idx = idx
            logger.debug(f"Found header row at index {idx}", keyword_count=keyword_count)
            break
    
    if header_row_idx is None:
        raise ValueError("Could not detect header row - no row contains at least 2 keywords")
    
    # Get top and sub headers
    top_header = df.iloc[header_row_idx].fillna(method='ffill')  # Forward fill
    sub_header = df.iloc[header_row_idx + 1].fillna("") if header_row_idx + 1 < len(df) else pd.Series()
    
    # Combine headers
    column_names = []
    for i, (top, sub) in enumerate(zip(top_header, sub_header)):
        top_str = str(top).strip() if pd.notna(top) else ""
        sub_str = str(sub).strip() if pd.notna(sub) and str(sub) != "nan" else ""
        
        if top_str and sub_str:
            combined = f"{top_str}__{sub_str}"
        elif top_str:
            combined = top_str
        elif sub_str:
            combined = sub_str
        else:
            combined = f"col_{i}"
        
        column_names.append(normalize_column_name(combined))
    
    data_start_row = header_row_idx + 2  # Skip both header rows
    
    logger.info(
        f"Header detection complete",
        header_row=header_row_idx,
        data_start_row=data_start_row,
        column_count=len(column_names)
    )
    
    return data_start_row, column_names


def extract_project_meta(df: pd.DataFrame, data_start_row: int, logger: StructuredLogger) -> Dict[str, Any]:
    """
    Extract project metadata from the top section of the Excel file.
    
    Args:
        df: Raw DataFrame from Excel
        data_start_row: Row where actual data starts
        logger: Logger instance
    
    Returns:
        Dictionary containing project metadata
    """
    meta = {}
    
    # Look for key:value pairs in the top section
    for idx in range(min(data_start_row, len(df))):
        row = df.iloc[idx]
        
        for col_idx, cell in enumerate(row):
            if pd.isna(cell):
                continue
                
            cell_str = str(cell).strip()
            
            # Look for colon separator
            if "：" in cell_str:
                parts = cell_str.split("：", 1)
                if len(parts) == 2:
                    key, value = parts[0].strip(), parts[1].strip()
                    if value and value != 'nan':
                        meta[key] = value
            elif ":" in cell_str:
                parts = cell_str.split(":", 1)
                if len(parts) == 2:
                    key, value = parts[0].strip(), parts[1].strip()
                    if value and value != 'nan':
                        meta[key] = value
            else:
                # Check if next cell contains the value
                if col_idx + 1 < len(row):
                    next_cell = row.iloc[col_idx + 1]
                    if pd.notna(next_cell) and str(next_cell).strip() != 'nan':
                        # Common project metadata keys
                        if any(kw in cell_str for kw in ["PJCD", "案件名", "住所", "AC", "DC", "区分"]):
                            meta[cell_str] = str(next_cell).strip()
    
    # Type conversion for known fields
    if "AC" in meta:
        meta["AC"] = to_number(meta["AC"])
    if "DC" in meta:
        meta["DC"] = to_number(meta["DC"])
    
    logger.info(f"Extracted project metadata", meta_keys=list(meta.keys()))
    return meta


def is_detail_row(row: pd.Series, account_code_regex: str, subtotal_keywords: List[str]) -> bool:
    """
    Determine if a row contains detail data (not summary/total row).
    
    Args:
        row: DataFrame row
        account_code_regex: Regex pattern for valid account codes
        subtotal_keywords: Keywords that indicate summary rows
    
    Returns:
        True if row contains detail data
    """
    account_code = str(row.get("項目CD", "")).strip()
    
    # Check account code format
    if not re.match(account_code_regex, account_code):
        return False
    
    # Check for subtotal keywords
    row_text = "|".join(str(cell) for cell in row.values if isinstance(cell, str))
    if any(keyword in row_text for keyword in subtotal_keywords):
        return False
    
    return True


def process_excel_file(
    file_path: str, 
    sheet_name: str,
    account_code_regex: str,
    subtotal_keywords: List[str],
    logger: StructuredLogger
) -> Tuple[pd.DataFrame, Dict[str, Any]]:
    """
    Process Excel file and extract structured data.
    
    Args:
        file_path: Path to Excel file
        sheet_name: Sheet name to process
        account_code_regex: Regex for valid account codes
        subtotal_keywords: Keywords for subtotal detection
        logger: Logger instance
    
    Returns:
        Tuple of (processed_dataframe, project_metadata)
    """
    logger.info(f"Processing Excel file: {file_path}")
    
    try:
        # Read Excel file
        df_raw = pd.read_excel(file_path, sheet_name=sheet_name, header=None)
        logger.debug(f"Raw data shape: {df_raw.shape}")
        
        # Detect headers and get column names
        data_start_row, column_names = detect_headers(df_raw, logger)
        
        # Extract project metadata
        project_meta = extract_project_meta(df_raw, data_start_row, logger)
        
        # Create DataFrame with proper headers
        df_data = df_raw.iloc[data_start_row:].copy()
        df_data.columns = column_names
        df_data.reset_index(drop=True, inplace=True)
        
        # Add source tracking information
        df_data['source_file'] = file_path
        df_data['source_row'] = df_data.index + data_start_row + 1  # Excel row numbers (1-based)
        
        # Generate source hash for each row
        df_data['source_hash'] = df_data.apply(
            lambda row: hashlib.sha256(
                f"{file_path}|{row['source_row']}|{row.get('項目CD', '')}".encode('utf-8')
            ).hexdigest(),
            axis=1
        )
        
        # Filter detail rows
        detail_mask = df_data.apply(
            lambda row: is_detail_row(row, account_code_regex, subtotal_keywords),
            axis=1
        )
        
        df_details = df_data[detail_mask].copy()
        df_rejected = df_data[~detail_mask].copy()
        
        logger.info(
            f"Excel processing complete",
            total_rows=len(df_data),
            detail_rows=len(df_details),
            rejected_rows=len(df_rejected)
        )
        
        return df_details, project_meta
        
    except Exception as e:
        logger.error(f"Error processing Excel file: {str(e)}")
        raise