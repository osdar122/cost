"""Configuration management for costetl."""

import os
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import yaml
from pydantic import BaseModel, Field


class AppConfig(BaseModel):
    """Application configuration."""
    
    input_dir: str = "./data/inbox"
    archive_dir: str = "./data/archive"
    reject_dir: str = "./data/rejects"
    log_dir: str = "./logs"
    default_sheet: str = "Sheet1"


class DatabaseConfig(BaseModel):
    """Database configuration."""
    
    url: str = "postgresql+psycopg2://user:pass@localhost:5432/appdb"
    existing_db_url: Optional[str] = None
    schema_name: str = "cost"


class IntegrationConfig(BaseModel):
    """Integration configuration with existing systems."""
    
    existing_projects_table: str = "existing.projects"
    existing_vendors_table: str = "existing.vendors"
    enable_fuzzy_vendor_match: bool = True
    fuzzy_threshold: int = 90


class RulesConfig(BaseModel):
    """Business rules configuration."""
    
    account_code_regex: str = r"^[A-Z]\.[0-9]+(\.[0-9]+)*$"
    subtotal_keywords: List[str] = Field(
        default=["合計", "小計", "累計", "売上合計", "kW単価"]
    )
    vendor_normalize_patterns: List[Tuple[str, str]] = Field(
        default=[
            ("（株）", ""),
            ("(株)", ""),
            ("株式会社", ""),
            ("有限会社", ""),
            ("(有)", ""),
            ("　", " "),  # Full-width space to half-width
            ("\u3000", " "),  # Same as above
        ]
    )


class Config(BaseModel):
    """Main configuration model."""
    
    app: AppConfig = Field(default_factory=AppConfig)
    db: DatabaseConfig = Field(default_factory=DatabaseConfig)
    integration: IntegrationConfig = Field(default_factory=IntegrationConfig)
    rules: RulesConfig = Field(default_factory=RulesConfig)

    @classmethod
    def from_file(cls, config_path: str) -> "Config":
        """Load configuration from YAML file."""
        if not os.path.exists(config_path):
            return cls()
        
        with open(config_path, 'r', encoding='utf-8') as f:
            data = yaml.safe_load(f) or {}
        
        return cls(**data)

    @classmethod
    def from_env(cls) -> "Config":
        """Load configuration from environment variables."""
        config = cls()
        
        # Override with environment variables if present
        if db_url := os.getenv("DATABASE_URL"):
            config.db.url = db_url
        if existing_db_url := os.getenv("EXISTING_DATABASE_URL"):
            config.db.existing_db_url = existing_db_url
        
        return config

    def ensure_directories(self) -> None:
        """Ensure all required directories exist."""
        for dir_path in [
            self.app.input_dir,
            self.app.archive_dir,
            self.app.reject_dir,
            self.app.log_dir,
        ]:
            Path(dir_path).mkdir(parents=True, exist_ok=True)


# Column alias mapping for data extraction
COLUMN_ALIASES: Dict[str, str] = {
    "項目CD": "account_code",
    "内容": "account_name",
    "協力会社__売上げの場合：売り先\\n仕入れの場合：仕入れ先": "vendor_name",
    "事業開始時予算__金額（円）": "budget_amount_jpy",
    "事業開始時予算__日付": "budget_date",
    "現時点の実施済み及び予定__金額（円）": "actual_plan_amount_jpy",
    "現時点の実施済み及び予定__日付": "actual_plan_date",
    "確定金額__金額": "confirmed_amount_jpy",
    "確定金額__日付": "confirmed_date",
    "請求書__支払日": "payment_date",
    "AF契約": "af_contract",
    "備考": "notes",
    "備考__1": "notes2",
    "納品日": "delivery_date",
    "発注書番号": "po_number",
}

# Measure mapping for narrow transformation
MEASURE_MAP = [
    ("budget", "事業開始時予算__金額（円）", "事業開始時予算__日付"),
    ("actual_or_plan", "現時点の実施済み及び予定__金額（円）", "現時点の実施済み及び予定__日付"),
    ("confirmed", "確定金額__金額", "確定金額__日付"),
]