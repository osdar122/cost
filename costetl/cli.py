"""Command-line interface for costetl."""

import sys
from datetime import datetime
from pathlib import Path
from typing import List, Optional

import click

from .config import Config
from .excel import process_excel_file
from .integrate import ExistingDBIntegrator, generate_unmatched_report
from .load import DatabaseLoader
from .logging_utils import get_logger
from .transform import extract_dimensions, transform_to_facts, validate_transformed_data
from .validate import DataValidator


@click.group()
def main() -> None:
    """Excel Cost Report ETL System."""
    pass


@main.command()
@click.option('--config', default='config.yaml', help='Configuration file path')
@click.option('--input', 'input_path', help='Input Excel file or directory')
@click.option('--dry-run', is_flag=True, help='Run without making database changes')
def ingest(config: str, input_path: Optional[str], dry_run: bool) -> None:
    """Ingest Excel cost reports into database."""
    
    # Load configuration
    try:
        config_obj = Config.from_file(config) if Path(config).exists() else Config.from_env()
        config_obj.ensure_directories()
    except Exception as e:
        click.echo(f"Error loading configuration: {e}")
        sys.exit(1)
    
    # Setup logging
    logger = get_logger(config_obj.app.log_dir)
    
    try:
        # Determine input files
        input_files = []
        if input_path:
            if Path(input_path).is_file():
                input_files = [input_path]
            elif Path(input_path).is_dir():
                input_files = list(Path(input_path).glob("*.xlsx"))
        else:
            input_files = list(Path(config_obj.app.input_dir).glob("*.xlsx"))
        
        if not input_files:
            logger.info("No Excel files found to process")
            return
        
        logger.info(f"Found {len(input_files)} files to process", files=[str(f) for f in input_files])
        
        # Setup database loader
        if not dry_run:
            db_loader = DatabaseLoader(config_obj.db.url, config_obj.db.schema_name, logger)
            db_loader.create_schema_and_tables()
            
            # Setup integrator
            integrator = ExistingDBIntegrator(
                config_obj.db.existing_db_url or config_obj.db.url,
                config_obj.integration.dict(),
                logger
            )
        else:
            db_loader = None
            integrator = None
        
        # Process each file
        total_summary = {
            "files_processed": 0,
            "files_failed": 0,
            "total_facts": 0,
            "loaded_facts": 0,
            "skipped_facts": 0,
            "errors": 0,
        }
        
        for file_path in input_files:
            try:
                logger.info(f"Processing file: {file_path}")
                
                # Extract data from Excel
                df_details, project_meta = process_excel_file(
                    str(file_path),
                    config_obj.app.default_sheet,
                    config_obj.rules.account_code_regex,
                    config_obj.rules.subtotal_keywords,
                    logger
                )
                
                if len(df_details) == 0:
                    logger.warning(f"No detail rows found in {file_path}")
                    continue
                
                # Transform data
                projects, accounts, vendors = extract_dimensions(df_details, project_meta, logger)
                facts = transform_to_facts(df_details, logger)
                
                # Validate if this is the sample file
                if "コストレポート例" in str(file_path):
                    expected_totals = {
                        "budget": 836078000,
                        "actual_or_plan": 778222542,
                        "confirmed": 147640758,
                    }
                    
                    if not validate_transformed_data(facts, expected_totals, logger):
                        logger.error("Sample file validation failed!")
                        if not dry_run:
                            sys.exit(1)
                
                # Load to database
                if not dry_run and db_loader:
                    project_data = projects[0] if projects else {}
                    load_summary = db_loader.load_facts(
                        facts,
                        project_data,
                        accounts,
                        vendors,
                        config_obj.integration.dict(),
                        integrator
                    )
                    
                    # Update totals
                    for key in ["total_facts", "loaded_facts", "skipped_facts", "errors"]:
                        total_summary[key] += load_summary.get(key, 0)
                
                total_summary["files_processed"] += 1
                logger.info(f"Successfully processed {file_path}")
                
            except Exception as e:
                logger.error(f"Error processing {file_path}: {e}")
                total_summary["files_failed"] += 1
        
        # Save summary
        logger.save_summary(total_summary)
        
        logger.info("Ingestion complete", summary=total_summary)
        
        if total_summary["files_failed"] > 0:
            sys.exit(1)
            
    except Exception as e:
        logger.error(f"Fatal error in ingestion: {e}")
        sys.exit(1)


@main.command()
@click.option('--config', default='config.yaml', help='Configuration file path')
@click.argument('entity', type=click.Choice(['vendors', 'projects']))
def reconcile(config: str, entity: str) -> None:
    """Generate reconciliation reports for unmatched entities."""
    
    # Load configuration
    config_obj = Config.from_file(config) if Path(config).exists() else Config.from_env()
    logger = get_logger(config_obj.app.log_dir)
    
    try:
        if entity == 'vendors':
            # Load vendors from database and generate unmatched report
            db_loader = DatabaseLoader(config_obj.db.url, config_obj.db.schema_name, logger)
            integrator = ExistingDBIntegrator(
                config_obj.db.existing_db_url or config_obj.db.url,
                config_obj.integration.dict(),
                logger
            )
            
            # Get vendors from database
            with db_loader.SessionLocal() as session:
                vendors_result = session.execute(
                    f"SELECT DISTINCT vendor_name FROM {config_obj.db.schema_name}.dim_vendor WHERE existing_vendor_id IS NULL"
                )
                vendors = [{"vendor_name": row[0]} for row in vendors_result]
            
            if vendors:
                output_path = Path(config_obj.app.log_dir) / f"unmatched_vendors_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
                generate_unmatched_report(vendors, integrator, str(output_path))
                logger.info(f"Unmatched vendors report generated: {output_path}")
            else:
                logger.info("No unmatched vendors found")
                
        elif entity == 'projects':
            logger.info("Project reconciliation not yet implemented")
            
    except Exception as e:
        logger.error(f"Error in reconciliation: {e}")
        sys.exit(1)


@main.command()
@click.option('--config', default='config.yaml', help='Configuration file path')
@click.option('--input', required=True, help='Input Excel file to validate')
def validate(config: str, input: str) -> None:
    """Validate Excel file using Great Expectations."""
    
    # Load configuration
    config_obj = Config.from_file(config) if Path(config).exists() else Config.from_env()
    logger = get_logger(config_obj.app.log_dir)
    
    try:
        validator = DataValidator(logger)
        
        # Expected totals for sample file
        expected_totals = {
            "budget": 836078000,
            "actual_or_plan": 778222542,
            "confirmed": 147640758,
        }
        
        success = validator.validate_sample_file(input, expected_totals)
        
        if success:
            logger.info("Validation passed")
        else:
            logger.error("Validation failed")
            sys.exit(1)
            
    except Exception as e:
        logger.error(f"Error in validation: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()