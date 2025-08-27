"""Excel schema loading from JSON to guide parsing/mapping."""

from __future__ import annotations

from pathlib import Path
from typing import Dict, List, Optional

import json
from pydantic import BaseModel, Field


class ExcelSchema(BaseModel):
    """Schema definition to assist Excel parsing.

    All fields are optional; when provided, they override defaults.
    """

    # Keywords to help locate the header row (either row of a 2-row header)
    header_keywords: List[str] = Field(default_factory=list)

    # Regex for valid account codes like "A.1.2"; when provided, overrides config.rules.account_code_regex
    account_code_regex: Optional[str] = None

    # Keywords that indicate subtotal/summary rows; extends/overrides config.rules.subtotal_keywords
    subtotal_keywords: List[str] = Field(default_factory=list)

    # Optional mapping from combined header text (after normalization) to canonical names
    # e.g., {"協力会社__売上げの場合：売り先\\n仕入れの場合：仕入れ先": "vendor_name"}
    column_aliases: Dict[str, str] = Field(default_factory=dict)

    @classmethod
    def from_file(cls, path: str) -> "ExcelSchema":
        """Load schema from a JSON file."""
        data = json.loads(Path(path).read_text(encoding="utf-8"))
        return cls(**data)
