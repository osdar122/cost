"""Tests for header detection functionality."""

import pandas as pd
import pytest

from costetl.excel import detect_headers
from costetl.logging_utils import get_logger


class TestHeaderDetection:
    """Test header detection functionality."""
    
    def setup_method(self):
        """Setup test environment."""
        self.logger = get_logger()
    
    def test_detect_headers_with_keywords(self):
        """Test header detection with proper keywords."""
        # Create sample DataFrame with header rows
        data = [
            ["", "", "", "", "", ""],
            ["メタ情報", "値", "", "", "", ""],
            ["PJCD", "EM20", "", "", "", ""],
            ["", "", "", "", "", ""],
            ["項目CD", "内容", "協力会社", "事業開始時予算", "現時点の実施済み", "確定金額"],
            ["", "", "売上げの場合：売り先", "金額（円）", "金額（円）", "金額"],
            ["A.1", "工事費", "ABC建設", "1000000", "800000", "750000"],
        ]
        
        df = pd.DataFrame(data)
        
        data_start_row, column_names = detect_headers(df, self.logger)
        
        assert data_start_row == 6  # Data starts after 2-row header
        assert len(column_names) > 0
        assert any("項目CD" in col for col in column_names)
        assert any("協力会社" in col for col in column_names)
    
    def test_header_detection_failure(self):
        """Test header detection failure when keywords not found."""
        # Create DataFrame without proper headers
        data = [
            ["col1", "col2", "col3"],
            ["data1", "data2", "data3"],
            ["data4", "data5", "data6"],
        ]
        
        df = pd.DataFrame(data)
        
        with pytest.raises(ValueError, match="Could not detect header row"):
            detect_headers(df, self.logger)
    
    def test_combined_header_names(self):
        """Test that header names are properly combined."""
        data = [
            ["項目CD", "内容", "協力会社", "事業開始時予算"],
            ["", "", "売上げの場合", "金額（円）"],
            ["A.1", "工事費", "ABC建設", "1000000"],
        ]
        
        df = pd.DataFrame(data)
        
        data_start_row, column_names = detect_headers(df, self.logger)
        
        # Check that headers are combined properly
        assert "協力会社__売上げの場合" in column_names
        assert "事業開始時予算__金額（円）" in column_names