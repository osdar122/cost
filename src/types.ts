export type UnitBasis = 'ac' | 'dc' | 'custom';

export type Item = {
  id: number;
  code: string;
  display_code?: string;
  title: string;
  vendor?: string;
  budget_amount?: number | null;
  budget_date?: string | null;
  actual_planned_amount?: number | null;
  actual_planned_date?: string | null;
  confirmed_amount?: number | null;
  confirmed_date?: string | null;
  payment_date?: string | null;
  is_paid?: boolean;
  af_contract_flag?: boolean;
  note?: string;
  delivery_date?: string | null;
  po_number?: string;
  is_aggregate_row?: boolean;
};
