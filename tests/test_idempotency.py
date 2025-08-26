"""Tests for idempotency functionality."""

import tempfile
import os
from unittest.mock import Mock, patch

import pytest
import pandas as pd

from costetl.load import DatabaseLoader
from costetl.logging_utils import get_logger


class TestIdempotency:
    """Test idempotency functionality."""
    
    def setup_method(self):
        """Setup test environment."""
        self.logger = get_logger()
    
    @patch('costetl.load.create_engine')
    @patch('costetl.load.sessionmaker')
    def test_duplicate_fact_prevention(self, mock_sessionmaker, mock_create_engine):
        """Test that duplicate facts are not inserted."""
        # Mock database components
        mock_engine = Mock()
        mock_create_engine.return_value = mock_engine
        
        mock_session_class = Mock()
        mock_sessionmaker.return_value = mock_session_class
        
        mock_session = Mock()
        mock_session_class.return_value.__enter__.return_value = mock_session
        
        # Mock existing fact check
        mock_result = Mock()
        mock_result.first.return_value = Mock(cost_id=1)  # Simulate existing fact
        mock_session.execute.return_value = mock_result
        
        # Create loader
        loader = DatabaseLoader("mock://db", "test_schema", self.logger)
        
        # Test facts with same hash
        facts = [
            {
                "account_code": "A.1",
                "vendor_name": "Test Vendor",
                "measure": "budget",
                "amount_jpy": 1000000,
                "source_file": "test.xlsx",
                "source_row": 1,
                "source_hash": "same_hash_123",
                "event_date": None,
                "payment_date": None,
                "notes": ""
            },
            {
                "account_code": "A.1",
                "vendor_name": "Test Vendor", 
                "measure": "budget",
                "amount_jpy": 1000000,
                "source_file": "test.xlsx",
                "source_row": 1,
                "source_hash": "same_hash_123",  # Same hash
                "event_date": None,
                "payment_date": None,
                "notes": ""
            }
        ]
        
        project_data = {"pjcd": "TEST01"}
        accounts = [{"account_code": "A.1", "account_name": "Test Account"}]
        vendors = [{"vendor_name": "Test Vendor"}]
        
        # Mock dimension upserts
        mock_session.execute.return_value.scalar.return_value = 1
        
        summary = loader.load_facts(facts, project_data, accounts, vendors, {})
        
        # Should skip duplicate facts
        assert summary["skipped_facts"] > 0
    
    def test_source_hash_generation(self):
        """Test that source hash is generated consistently."""
        import hashlib
        
        # Create identical row data
        file_path = "test.xlsx"
        source_row = 10
        account_code = "A.1.1"
        
        # Generate hash twice
        hash1 = hashlib.sha256(f"{file_path}|{source_row}|{account_code}".encode('utf-8')).hexdigest()
        hash2 = hashlib.sha256(f"{file_path}|{source_row}|{account_code}".encode('utf-8')).hexdigest()
        
        assert hash1 == hash2
        assert len(hash1) == 64  # SHA-256 produces 64-char hex string
    
    def test_different_hashes_for_different_rows(self):
        """Test that different rows generate different hashes."""
        import hashlib
        
        # Generate hashes for different rows
        hash1 = hashlib.sha256("file1.xlsx|1|A.1".encode('utf-8')).hexdigest()
        hash2 = hashlib.sha256("file1.xlsx|2|A.1".encode('utf-8')).hexdigest()
        hash3 = hashlib.sha256("file1.xlsx|1|A.2".encode('utf-8')).hexdigest()
        
        assert hash1 != hash2  # Different row numbers
        assert hash1 != hash3  # Different account codes
        assert hash2 != hash3  # Different everything