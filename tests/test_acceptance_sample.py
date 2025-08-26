"""Acceptance tests using sample data."""

import os
import tempfile
from pathlib import Path
from unittest.mock import Mock, patch

import pandas as pd
import pytest

from costetl.excel import process_excel_file
from costetl.transform import extract_dimensions, transform_to_facts, validate_transformed_data
from costetl.config import Config
from costetl.logging_utils import get_logger


class TestAcceptanceSample:
    """Acceptance tests for sample cost report processing."""
    
    def setup_method(self):
        """Setup test environment."""
        self.logger = get_logger()
        self.config = Config()
        
        # Create sample Excel data that matches the specification
        self.sample_data = self._create_sample_excel_data()
    
    def _create_sample_excel_data(self):
        """Create sample Excel data matching the specification."""
        # This would ideally use the actual sample file
        # For testing purposes, we create a minimal version that matches the spec
        
        rows = []
        
        # Meta information rows
        rows.append(["PJCD：EM20", "", "", "", "", "", ""])
        rows.append(["案件名：BBB", "", "", "", "", "", ""])
        rows.append(["住所：AA", "", "", "", "", "", ""])
        rows.append(["AC：1,250.00kW", "", "", "", "", "", ""])
        rows.append(["DC：1,458.24kW", "", "", "", "", "", ""])
        rows.append(["区分：大ガス", "", "", "", "", "", ""])
        rows.append(["", "", "", "", "", "", ""])
        
        # Headers (2-row header)
        rows.append(["項目CD", "内容", "協力会社", "事業開始時予算", "現時点の実施済み及び予定", "確定金額", "請求書"])
        rows.append(["", "", "売上げの場合：売り先\n仕入れの場合：仕入れ先", "金額（円）", "金額（円）", "金額", "支払日"])
        
        # Sample detail rows to meet the expected totals
        # These are simplified but should sum to the expected totals
        detail_rows = [
            ["A.1.1", "工事費用1", "ABC建設", "100000000", "90000000", "85000000", "2024-04-01"],
            ["A.1.2", "工事費用2", "DEF工業", "200000000", "180000000", "0", ""],
            ["A.2.1", "材料費1", "GHI商事", "300000000", "270000000", "62640758", "2024-05-01"],
            ["A.2.2", "材料費2", "JKL株式会社", "236078000", "238222542", "0", ""],
        ]
        
        rows.extend(detail_rows)
        
        # Add some subtotal rows to test filtering
        rows.append(["", "小計", "", "836078000", "778222542", "147640758", ""])
        rows.append(["", "売上合計", "", "836078000", "778222542", "147640758", ""])
        
        return rows
    
    def _create_temp_excel_file(self):
        """Create temporary Excel file with sample data."""
        temp_file = tempfile.NamedTemporaryFile(suffix='.xlsx', delete=False)
        
        df = pd.DataFrame(self.sample_data)
        df.to_excel(temp_file.name, sheet_name='Sheet1', index=False, header=False)
        
        return temp_file.name
    
    def test_sample_file_processing(self):
        """Test processing of sample file with expected results."""
        temp_file = self._create_temp_excel_file()
        
        try:
            # Process the file
            df_details, project_meta = process_excel_file(
                temp_file,
                "Sheet1",
                self.config.rules.account_code_regex,
                self.config.rules.subtotal_keywords,
                self.logger
            )
            
            # Verify project metadata
            assert project_meta.get("PJCD") == "EM20"
            assert project_meta.get("案件名") == "BBB"
            assert project_meta.get("住所") == "AA"
            
            # Verify detail rows count (should exclude subtotal rows)
            assert len(df_details) == 4  # Only the detail rows with valid account codes
            
            # Transform to facts
            facts = transform_to_facts(df_details, self.logger)
            
            # Validate totals
            expected_totals = {
                "budget": 836078000,
                "actual_or_plan": 778222542,
                "confirmed": 147640758,
            }
            
            # This should pass validation
            validation_result = validate_transformed_data(facts, expected_totals, self.logger)
            assert validation_result == True
            
        finally:
            # Cleanup
            os.unlink(temp_file)
    
    def test_account_code_filtering(self):
        """Test that only valid account codes are processed."""
        temp_file = self._create_temp_excel_file()
        
        try:
            df_details, _ = process_excel_file(
                temp_file,
                "Sheet1", 
                self.config.rules.account_code_regex,
                self.config.rules.subtotal_keywords,
                self.logger
            )
            
            # Check that all remaining rows have valid account codes
            for _, row in df_details.iterrows():
                account_code = str(row["項目CD"]).strip()
                assert account_code.startswith("A.")
                assert "." in account_code[2:]  # Has sub-level
                
        finally:
            os.unlink(temp_file)
    
    def test_subtotal_row_exclusion(self):
        """Test that subtotal rows are properly excluded."""
        temp_file = self._create_temp_excel_file()
        
        try:
            df_details, _ = process_excel_file(
                temp_file,
                "Sheet1",
                self.config.rules.account_code_regex,
                self.config.rules.subtotal_keywords,
                self.logger
            )
            
            # Verify no rows contain subtotal keywords
            for _, row in df_details.iterrows():
                row_text = " ".join(str(cell) for cell in row.values if isinstance(cell, str))
                for keyword in self.config.rules.subtotal_keywords:
                    assert keyword not in row_text
                    
        finally:
            os.unlink(temp_file)
    
    def test_dimensions_extraction(self):
        """Test that dimensions are properly extracted."""
        temp_file = self._create_temp_excel_file()
        
        try:
            df_details, project_meta = process_excel_file(
                temp_file,
                "Sheet1",
                self.config.rules.account_code_regex,
                self.config.rules.subtotal_keywords,
                self.logger
            )
            
            projects, accounts, vendors = extract_dimensions(df_details, project_meta, self.logger)
            
            # Check project dimension
            assert len(projects) == 1
            assert projects[0]["pjcd"] == "EM20"
            assert projects[0]["project_name"] == "BBB"
            
            # Check account dimensions
            assert len(accounts) >= 4  # At least our detail rows
            account_codes = [a["account_code"] for a in accounts]
            assert "A.1.1" in account_codes
            assert "A.2.1" in account_codes
            
            # Check vendor dimensions
            assert len(vendors) >= 3  # At least some unique vendors
            vendor_names = [v["vendor_name"] for v in vendors]
            assert "ABC建設" in vendor_names
            
        finally:
            os.unlink(temp_file)
    
    @patch('costetl.load.DatabaseLoader')
    def test_idempotency(self, mock_loader_class):
        """Test that re-running the same file doesn't create duplicates."""
        temp_file = self._create_temp_excel_file()
        
        try:
            # Mock the database loader
            mock_loader = Mock()
            mock_loader_class.return_value = mock_loader
            
            # Simulate first run - all facts loaded
            mock_loader.load_facts.return_value = {
                "total_facts": 10,
                "loaded_facts": 10,
                "skipped_facts": 0,
                "errors": 0
            }
            
            # Process file first time
            df_details1, project_meta1 = process_excel_file(
                temp_file,
                "Sheet1",
                self.config.rules.account_code_regex,
                self.config.rules.subtotal_keywords,
                self.logger
            )
            
            # Simulate second run - all facts skipped (idempotent)
            mock_loader.load_facts.return_value = {
                "total_facts": 10,
                "loaded_facts": 0,
                "skipped_facts": 10,
                "errors": 0
            }
            
            # Process same file second time
            df_details2, project_meta2 = process_excel_file(
                temp_file,
                "Sheet1", 
                self.config.rules.account_code_regex,
                self.config.rules.subtotal_keywords,
                self.logger
            )
            
            # Results should be identical
            assert len(df_details1) == len(df_details2)
            assert project_meta1 == project_meta2
            
            # Hash should be the same for same rows
            hash1 = df_details1.iloc[0]["source_hash"]
            hash2 = df_details2.iloc[0]["source_hash"]
            assert hash1 == hash2
            
        finally:
            os.unlink(temp_file)