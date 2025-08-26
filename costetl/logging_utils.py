"""Logging utilities for costetl."""

import json
import sys
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Optional

from loguru import logger


class StructuredLogger:
    """Structured logger with JSON output capabilities."""
    
    def __init__(self, log_dir: str = "./logs", run_id: Optional[str] = None):
        self.log_dir = Path(log_dir)
        self.log_dir.mkdir(parents=True, exist_ok=True)
        
        self.run_id = run_id or datetime.now().strftime("%Y%m%d_%H%M%S")
        self.json_log_path = self.log_dir / f"run_{self.run_id}.jsonl"
        self.summary_path = self.log_dir / f"summary_{self.run_id}.json"
        
        # Configure loguru
        logger.remove()  # Remove default handler
        
        # Human-readable console output
        logger.add(
            sys.stdout,
            format="<green>{time:YYYY-MM-DD HH:mm:ss}</green> | "
                   "<level>{level: <8}</level> | "
                   "<cyan>{name}</cyan>:<cyan>{function}</cyan>:<cyan>{line}</cyan> - "
                   "<level>{message}</level>",
            level="INFO"
        )
        
        # JSON structured log file
        logger.add(
            self.json_log_path,
            format="{time} | {level} | {name}:{function}:{line} | {message}",
            level="DEBUG",
            serialize=True
        )
    
    def info(self, message: str, **kwargs: Any) -> None:
        """Log info message with structured data."""
        logger.bind(**kwargs).info(message)
    
    def warning(self, message: str, **kwargs: Any) -> None:
        """Log warning message with structured data."""
        logger.bind(**kwargs).warning(message)
    
    def error(self, message: str, **kwargs: Any) -> None:
        """Log error message with structured data."""
        logger.bind(**kwargs).error(message)
    
    def debug(self, message: str, **kwargs: Any) -> None:
        """Log debug message with structured data."""
        logger.bind(**kwargs).debug(message)
    
    def save_summary(self, summary: Dict[str, Any]) -> None:
        """Save processing summary to JSON file."""
        summary["run_id"] = self.run_id
        summary["timestamp"] = datetime.now().isoformat()
        
        with open(self.summary_path, 'w', encoding='utf-8') as f:
            json.dump(summary, f, ensure_ascii=False, indent=2)
        
        self.info(f"Summary saved to {self.summary_path}", summary=summary)


def get_logger(log_dir: str = "./logs", run_id: Optional[str] = None) -> StructuredLogger:
    """Get configured logger instance."""
    return StructuredLogger(log_dir, run_id)