"""Tests for data transformation functionality."""

import pandas as pd
import pytest

from costetl.transform import melt_measures, extract_dimensions, transform_to_facts
from costetl.config import MEASURE_MAP
from costetl.logging_utils import get_logger


class TestTransform:
    """Test data transformation functionality."""
    
    def setup_method(self):
        """Setup test environment."""
        self.logger = get_logger()
    
    def test_melt_measures(self):
        """Test measure melting from wide to narrow format."""
        # Create sample row with multiple amounts
        row_data = {
            "項目CD": "A.1.1",
            "内容": "Test Account",
            "事業開始時予算__金額（円）": 1000000,
            "事業開始時予算__日付": "2024-01-01",
            "現時点の実施済み及び予定__金額（円）": 800000,
            "現時点の実施済み及び予定__日付": "2024-02-01",
            "確定金額__金額": 750000,
            "確定金額__日付": "2024-03-01",
            "請求書__支払日": "2024-04-01",
            "source_file": "test.xlsx",
            "source_row": 1,
            "source_hash": "test_hash"
        }
        
        row = pd.Series(row_data)
        measures = melt_measures(row, MEASURE_MAP)
        
        # Should generate 3 measures
        assert len(measures) == 3
        
        # Check measure types
        measure_types = [m["measure"] for m in measures]
        assert "budget" in measure_types
        assert "actual_or_plan" in measure_types
        assert "confirmed" in measure_types
        
        # Check amounts
        budget_measure = next(m for m in measures if m["measure"] == "budget")
        assert budget_measure["amount_jpy"] == 1000000
    
    def test_melt_measures_with_zeros(self):
        """Test that zero amounts are filtered out."""
        row_data = {
            "項目CD": "A.1.1",
            "事業開始時予算__金額（円）": 1000000,
            "現時点の実施済み及び予定__金額（円）": 0,  # Zero amount
            "確定金額__金額": None,  # None amount
            "source_file": "test.xlsx",
            "source_row": 1,
            "source_hash": "test_hash"
        }
        
        row = pd.Series(row_data)
        measures = melt_measures(row, MEASURE_MAP)
        
        # Should only generate 1 measure (budget)
        assert len(measures) == 1
        assert measures[0]["measure"] == "budget"
    
    def test_extract_dimensions(self):
        """Test dimension extraction from DataFrame."""
        # Create sample DataFrame
        data = {
            "項目CD": ["A.1", "A.1.1", "B.1"],
            "内容": ["Account A", "Sub Account A", "Account B"],
            "協力会社__売上げの場合：売り先\\n仕入れの場合：仕入れ先": ["Vendor A", "Vendor B", "Vendor A"],
        }
        
        df = pd.DataFrame(data)
        
        project_meta = {
            "PJCD": "EM20",
            "案件名": "Test Project",
            "住所": "Test Address",
            "AC": "1000.5",
            "DC": "1200.0"
        }
        
        projects, accounts, vendors = extract_dimensions(df, project_meta, self.logger)
        
        # Check project
        assert len(projects) == 1
        assert projects[0]["pjcd"] == "EM20"
        assert projects[0]["project_name"] == "Test Project"
        
        # Check accounts
        assert len(accounts) == 3
        account_codes = [a["account_code"] for a in accounts]
        assert "A.1" in account_codes
        assert "A.1.1" in account_codes
        assert "B.1" in account_codes
        
        # Check vendors
        assert len(vendors) == 2  # Unique vendors
        vendor_names = [v["vendor_name"] for v in vendors]
        assert "Vendor A" in vendor_names
        assert "Vendor B" in vendor_names
    
    def test_transform_to_facts(self):
        """Test transformation to fact table format."""
        # Create sample DataFrame
        data = {
            "項目CD": ["A.1", "A.2"],
            "内容": ["Account A", "Account B"],
            "協力会社__売上げの場合：売り先\\n仕入れの場合：仕入れ先": ["Vendor A", "Vendor B"],
            "事業開始時予算__金額（円）": [1000000, 2000000],
            "現時点の実施済み及び予定__金額（円）": [800000, 1800000],
            "確定金額__金額": [0, 1700000],  # Zero for first row
            "source_file": ["test.xlsx", "test.xlsx"],
            "source_row": [1, 2],
            "source_hash": ["hash1", "hash2"]
        }
        
        df = pd.DataFrame(data)
        facts = transform_to_facts(df, self.logger)
        
        # Should generate facts for non-zero amounts
        # Row 1: budget + actual_or_plan (2 facts)
        # Row 2: budget + actual_or_plan + confirmed (3 facts)
        assert len(facts) == 5
        
        # Check that account codes are preserved
        account_codes = [f["account_code"] for f in facts]
        assert "A.1" in account_codes
        assert "A.2" in account_codes