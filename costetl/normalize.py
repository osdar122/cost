"""Data normalization utilities."""

import re
import unicodedata
from datetime import datetime
from typing import Any, Optional, Union

import pandas as pd
from dateutil import parser as date_parser


def normalize_column_name(name: str) -> str:
    """
    Normalize column name for consistent mapping.
    
    Args:
        name: Raw column name
    
    Returns:
        Normalized column name
    """
    if pd.isna(name):
        return ""
    
    # Convert to string and strip
    name = str(name).strip()
    
    # Replace actual newlines with literal \n for multiline headers (tests expect this)
    name = re.sub(r'\n+', r'\\n', name)
    name = re.sub(r'\s+', ' ', name)
    
    return name


def zenkaku_to_hankaku(text: str) -> str:
    """
    Convert full-width (zenkaku) characters to half-width (hankaku).
    
    Args:
        text: Input text
    
    Returns:
        Text with full-width characters converted to half-width
    """
    return unicodedata.normalize('NFKC', text)


def to_number(value: Any) -> Optional[float]:
    """
    Convert value to number, handling Japanese formatting.
    
    Args:
        value: Input value to convert
    
    Returns:
        Float value or None if conversion fails
    """
    if pd.isna(value) or value is None:
        return None
    
    # Convert to string
    str_val = str(value).strip()
    
    if not str_val or str_val.lower() == 'nan':
        return None
    
    try:
        # Remove common formatting characters
        cleaned = re.sub(r'[,¥￥]', '', str_val)
        
        # Convert full-width to half-width
        cleaned = zenkaku_to_hankaku(cleaned)
        
        # Handle parentheses as negative (accounting format)
        if cleaned.startswith('(') and cleaned.endswith(')'):
            cleaned = '-' + cleaned[1:-1]
        
        # Convert to float
        return float(cleaned)
        
    except (ValueError, TypeError):
        return None


def to_date(value: Any) -> Optional[datetime]:
    """
    Convert value to date, handling various formats including Excel serial dates.
    
    Args:
        value: Input value to convert
    
    Returns:
        datetime object or None if conversion fails
    """
    if pd.isna(value) or value is None:
        return None
    
    # Handle pandas Timestamp
    if isinstance(value, pd.Timestamp):
        return value.to_pydatetime()
    
    # Handle datetime
    if isinstance(value, datetime):
        return value
    
    # Handle string
    if isinstance(value, str):
        str_val = value.strip()
        if not str_val or str_val.lower() == 'nan':
            return None
        
        try:
            return date_parser.parse(str_val)
        except (ValueError, TypeError):
            return None
    
    # Handle numeric (Excel serial date)
    if isinstance(value, (int, float)):
        try:
            # Excel serial date starts from 1900-01-01 (with 1900 leap year bug)
            if 1 <= value <= 2958465:  # Valid Excel date range
                return pd.to_datetime('1899-12-30') + pd.Timedelta(days=value)
        except (ValueError, TypeError, OverflowError):
            pass
    
    return None


def normalize_vendor_name(name: str, normalize_patterns: list) -> str:
    """
    Normalize vendor name by removing common corporate suffixes and standardizing format.
    
    Args:
        name: Raw vendor name
        normalize_patterns: List of (pattern, replacement) tuples
    
    Returns:
        Normalized vendor name
    """
    if not name or pd.isna(name):
        return ""
    
    # Convert to string and basic cleanup
    normalized = str(name).strip()
    
    # Convert full-width to half-width
    normalized = zenkaku_to_hankaku(normalized)
    
    # Apply normalization patterns
    for pattern, replacement in normalize_patterns:
        normalized = normalized.replace(pattern, replacement)
    
    # Clean up extra whitespace
    normalized = ' '.join(normalized.split())
    
    return normalized


def extract_account_hierarchy(account_code: str) -> Optional[str]:
    """
    Extract parent account code from hierarchical account code.
    
    Args:
        account_code: Account code like "A.1.2.3"
    
    Returns:
        Parent account code like "A.1.2" or None if no parent
    """
    if not account_code or '.' not in account_code:
        return None
    
    parts = account_code.split('.')
    if len(parts) <= 2:  # e.g., "A.1" has no meaningful parent
        return None
    
    return '.'.join(parts[:-1])