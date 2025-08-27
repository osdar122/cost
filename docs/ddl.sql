-- Minimal DDL sketch based on v1.0 spec
CREATE TABLE projects (
  id BIGSERIAL PRIMARY KEY,
  pj_code VARCHAR(255) UNIQUE,
  pj_identifier VARCHAR(255),
  name VARCHAR(255),
  address VARCHAR(255),
  fit VARCHAR(255),
  kubun VARCHAR(255),
  capacity_dc_kw NUMERIC,
  capacity_ac_kw NUMERIC,
  module_model VARCHAR(255),
  pcs_model VARCHAR(255),
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE project_milestones (
  id BIGSERIAL PRIMARY KEY,
  project_id BIGINT NOT NULL REFERENCES projects(id),
  label VARCHAR(255) NOT NULL,
  due_date DATE,
  memo TEXT
);

CREATE TABLE vendors (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(255) UNIQUE NOT NULL,
  code VARCHAR(255)
);

CREATE TABLE cost_reports (
  id BIGSERIAL PRIMARY KEY,
  project_id BIGINT NOT NULL REFERENCES projects(id),
  version INT DEFAULT 1,
  status VARCHAR(32) DEFAULT 'draft',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  closed_at TIMESTAMP
);

CREATE TABLE cost_items (
  id BIGSERIAL PRIMARY KEY,
  project_id BIGINT NOT NULL REFERENCES projects(id),
  report_id BIGINT NOT NULL REFERENCES cost_reports(id),
  code VARCHAR(255),
  title VARCHAR(255),
  vendor_id BIGINT REFERENCES vendors(id),
  budget_amount BIGINT,
  budget_unit_price BIGINT,
  budget_date DATE,
  actual_planned_amount BIGINT,
  actual_planned_date DATE,
  confirmed_amount BIGINT,
  confirmed_date DATE,
  payment_date DATE,
  af_contract_flag BOOLEAN,
  af_contract_id BIGINT,
  note TEXT,
  delivery_date DATE,
  po_number VARCHAR(255),
  is_aggregate_row BOOLEAN DEFAULT FALSE,
  parent_id BIGINT REFERENCES cost_items(id),
  sort_order INT DEFAULT 0,
  row_state VARCHAR(32) DEFAULT 'active',
  row_version BIGINT DEFAULT 1
);
