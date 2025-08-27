import React from 'react';
import { Item, UnitBasis } from '../types';

const formatJPY = (v?: number | null) => {
  if (v === undefined || v === null || isNaN(v)) return '';
  return v.toLocaleString('ja-JP');
};

const parseNumber = (s: string): number | null => {
  const cleaned = s.replace(/[,\s]/g, '');
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
};

const levelFromCode = (code: string) => (code.split('.').length - 1);

const initialItems: Item[] = [
  { id: 1, code: 'A.1', title: '売上/工事', note: 'セクション見出し' },
  { id: 2, code: 'A.1.1', title: '工事費用1', vendor: 'ABC建設', budget_amount: 100_000_000, actual_planned_amount: 90_000_000, confirmed_amount: 85_000_000, payment_date: '2024-04-01', note: '' },
  { id: 3, code: 'A.1.2', title: '工事費用2', vendor: 'DEF工業', budget_amount: 200_000_000, actual_planned_amount: 180_000_000, confirmed_amount: null, note: '' },
  { id: 4, code: 'B.1', title: '仕入/材料', note: 'セクション見出し' },
  { id: 5, code: 'B.1.1', title: '材料費1', vendor: 'GHI商事', budget_amount: 300_000_000, actual_planned_amount: 270_000_000, confirmed_amount: 62_640_758, payment_date: '2024-05-01' },
  { id: 6, code: 'B.1.2', title: '材料費2', vendor: 'JKL株式会社', budget_amount: 236_078_000, actual_planned_amount: 238_222_542, confirmed_amount: null },
];

type Props = {
  items?: Item[];
  onItemsChange?: (items: Item[]) => void;
};

export const CostEditor: React.FC<Props> = ({ items: itemsProp, onItemsChange }) => {
  const [itemsState, setItemsState] = React.useState<Item[]>(itemsProp ?? initialItems);
  const [unitBasis, setUnitBasis] = React.useState<UnitBasis>('dc');
  const [dcKw, setDcKw] = React.useState<number>(1458.24);
  const [acKw, setAcKw] = React.useState<number>(1250.0);
  const [customKw, setCustomKw] = React.useState<number>(1458.24);
  const [editingId, setEditingId] = React.useState<number | null>(null);
  const [hideEmptyRows, setHideEmptyRows] = React.useState<boolean>(true);
  // Active top-level section (A=売上, B=原価)
  const [activeTop, setActiveTop] = React.useState<string>('A');
  // Filters & rules
  const [showUnpaidOnly, setShowUnpaidOnly] = React.useState<boolean>(false);
  const [showIssuesOnly, setShowIssuesOnly] = React.useState<boolean>(false);
  const [searchQuery, setSearchQuery] = React.useState<string>('');
  // Confirmed amount lock (契約金額として固定)
  const [lockConfirmed, setLockConfirmed] = React.useState<boolean>(true);

  const denomKw = unitBasis === 'dc' ? dcKw : unitBasis === 'ac' ? acKw : customKw;

  const items = itemsProp ?? itemsState;

  // Update available top keys and ensure activeTop is valid
  const topKeys = React.useMemo(() => {
    const keys = Array.from(new Set(items.map(i => i.code.split('.')[0]).filter(Boolean)));
    return keys;
  }, [items]);

  // Label-based cost summary detection: e.g., title/vendor/note contains both '仕入' and '合計'
  const isCostSummaryRow = React.useCallback((row: Item) => {
    const hay = `${row.title || ''} ${row.vendor || ''} ${row.note || ''}`;
    // Treat as cost/summary if labeled like '仕入合計' or contains '収支'
    return hay.includes('収支') || (hay.includes('仕入') && hay.includes('合計'));
  }, []);

  const costSummaryLabel = React.useCallback((row: Item) => {
    const hay = `${row.title || ''} ${row.vendor || ''} ${row.note || ''}`;
    if (hay.includes('収支')) return '収支';
    if (hay.includes('仕入')) return '仕入合計';
    return '合計';
  }, []);
  React.useEffect(() => {
    if (!topKeys.length) return;
    if (!topKeys.includes(activeTop)) {
      setActiveTop(topKeys.includes('A') ? 'A' : (topKeys.includes('B') ? 'B' : topKeys[0]));
    }
  }, [topKeys, activeTop]);

  // Build helpers for hierarchy and aggregates
  const { hasChildrenMap } = React.useMemo(() => {
    const codes = items.map(i => i.code);
    const hasChildrenMap = new Map<string, boolean>();
    for (const c of codes) {
      hasChildrenMap.set(c, codes.some(other => other !== c && other.startsWith(c + '.')));
    }
    return { hasChildrenMap };
  }, [items]);

  const isRowCompletelyEmpty = (row: Item) => {
    // Consider numeric 0 as data (not empty). Null/undefined/'' are empty.
    const s = (v: any) => (v === null || v === undefined || v === '' ? '' : String(v).trim());
    const n = (v: any) => (v === null || v === undefined ? null : Number(v));
    const hasTitle = !!s(row.title);
    const hasVendor = !!s(row.vendor);
    const hasBudget = n(row.budget_amount) !== null;
    const hasActual = n(row.actual_planned_amount) !== null;
    const hasConfirmed = n(row.confirmed_amount) !== null;
    const hasAnyDate = !!s(row.budget_date) || !!s(row.actual_planned_date) || !!s(row.confirmed_date) || !!s(row.payment_date) || !!s(row.delivery_date);
    const hasNote = !!s(row.note);
    const hasPO = !!s(row.po_number);
    return !(hasTitle || hasVendor || hasBudget || hasActual || hasConfirmed || hasAnyDate || hasNote || hasPO);
  };

  const viewItems = React.useMemo(() => {
    let base = items
      .filter(row => row.code.startsWith(activeTop + '.') || row.code === activeTop)
      .filter(row => !(activeTop === 'A' && isCostSummaryRow(row))); // always hide cost summary on A tab

    // Search
    const q = searchQuery.trim();
    if (q) {
      const lower = q.toLowerCase();
      base = base.filter(r => {
        const hay = `${r.code} ${r.display_code || ''} ${r.title || ''} ${r.vendor || ''}`.toLowerCase();
        return hay.includes(lower);
      });
    }

    // Unpaid only: exclude aggregates/summaries and keep rows without payment
    if (showUnpaidOnly) {
      base = base.filter(r => {
        const isAggregate = r.is_aggregate_row || !!hasChildrenMap.get(r.code);
        const isSummary = isCostSummaryRow(r);
        return !isAggregate && !isSummary && !r.is_paid;
      });
    }

    // Issues only: vendor missing, amount-without-date, confirmed-without-PO
    if (showIssuesOnly) {
      base = base.filter(r => {
        const isAggregate = r.is_aggregate_row || !!hasChildrenMap.get(r.code);
        if (isAggregate) return false;
        const missingVendor = !r.vendor || !r.vendor.trim();
        const actualNoDate = (r.actual_planned_amount || 0) > 0 && !r.actual_planned_date;
        const confirmedNoDate = (r.confirmed_amount || 0) > 0 && !r.confirmed_date;
        const poMissingWithConfirmed = (r.confirmed_amount || 0) > 0 && (!r.po_number || !r.po_number.trim());
        return missingVendor || actualNoDate || confirmedNoDate || poMissingWithConfirmed;
      });
    }

    if (!hideEmptyRows) return base;
    return base.filter(row => {
      if (editingId && row.id === editingId) return true; // keep visible while editing
      const isAggregate = row.is_aggregate_row || !!hasChildrenMap.get(row.code);
      if (isAggregate) return true; // keep structural rows
      return !isRowCompletelyEmpty(row);
    });
  }, [items, hideEmptyRows, editingId, hasChildrenMap, activeTop, isCostSummaryRow, showUnpaidOnly, showIssuesOnly, searchQuery]);

  const setItems = (updater: (prev: Item[]) => Item[]) => {
    const next = updater(items);
    if (onItemsChange) onItemsChange(next);
    else setItemsState(next);
  };

  const totals = React.useMemo(() => {
    // Sum only leaf/detail rows to avoid double counting aggregates
    const isLeaf = (code: string) => !hasChildrenMap.get(code);
    const sumByPrefix = (prefix: string, key: keyof Item) =>
      items
  .filter(it => it.code.startsWith(prefix + '.') && isLeaf(it.code))
  .filter(it => !isCostSummaryRow(it)) // exclude labeled summary rows like '仕入合計'
        .map(it => (it[key] as number | null) || 0)
        .reduce((a, b) => a + (b || 0), 0);
    return {
      A: {
        budget: sumByPrefix('A', 'budget_amount'),
        actual: sumByPrefix('A', 'actual_planned_amount'),
        confirmed: sumByPrefix('A', 'confirmed_amount'),
      },
      B: {
        budget: sumByPrefix('B', 'budget_amount'),
        actual: sumByPrefix('B', 'actual_planned_amount'),
        confirmed: sumByPrefix('B', 'confirmed_amount'),
      }
    };
  }, [items, hasChildrenMap, isCostSummaryRow]);

  const onChangeCell = (id: number, field: keyof Item, value: any) => {
    setItems(prev => prev.map(it => (it.id === id ? { ...it, [field]: value } : it)));
  };

  const addRow = (parentCode?: string) => {
    const nextId = (items.reduce((m, it) => Math.max(m, it.id), 0) || 0) + 1;
    // Find next sequence under parent or under A.1 by default
    const base = parentCode || 'A.1';
    const siblings = items.filter(it => it.code.startsWith(base + '.'));
    const nextSeq = siblings
      .map(s => s.code.split('.').pop()!)
      .map(Number)
      .filter(n => Number.isFinite(n))
      .reduce((m, n) => Math.max(m, n), 0) + 1;
    const newCode = `${base}.${nextSeq}`;
    const newItem: Item = { id: nextId, code: newCode, title: '', vendor: '', budget_amount: null };
    setItems(prev => [...prev, newItem]);
    setEditingId(nextId);
  };

  const duplicateRow = (id: number) => {
    const src = items.find(i => i.id === id);
    if (!src) return;
    const nextId = (items.reduce((m, it) => Math.max(m, it.id), 0) || 0) + 1;
    const copy: Item = { ...src, id: nextId, code: `${src.code}.copy` };
    setItems(prev => [...prev, copy]);
    setEditingId(nextId);
  };

  const removeRow = (id: number) => {
    setItems(prev => prev.filter(i => i.id !== id));
  };

  const kwUnitPrice = (amount?: number | null) => {
    if (!amount || !denomKw || denomKw === 0) return '';
    const unit = Math.round(amount / denomKw);
    return formatJPY(unit);
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">編集グリッド（モックデータ）</h3>
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-700">kW分母:</label>
          <select
            className="border rounded px-2 py-1 text-sm"
            value={unitBasis}
            onChange={e => setUnitBasis(e.target.value as UnitBasis)}
          >
            <option value="dc">DC</option>
            <option value="ac">AC</option>
            <option value="custom">カスタム</option>
          </select>
          {unitBasis === 'dc' && (
            <input className="border rounded px-2 py-1 w-28 text-sm" value={dcKw}
              onChange={e => setDcKw(Number(e.target.value))} />
          )}
          {unitBasis === 'ac' && (
            <input className="border rounded px-2 py-1 w-28 text-sm" value={acKw}
              onChange={e => setAcKw(Number(e.target.value))} />
          )}
          {unitBasis === 'custom' && (
            <input className="border rounded px-2 py-1 w-28 text-sm" value={customKw}
              onChange={e => setCustomKw(Number(e.target.value))} />
          )}
          {/* A/B tabs */}
          <div className="ml-2 flex items-center gap-2">
            {topKeys.map(k => (
              <button key={k}
                onClick={() => setActiveTop(k)}
                className={(activeTop === k ? (k === 'A' ? 'bg-amber-600 text-white' : k === 'B' ? 'bg-cyan-600 text-white' : 'bg-gray-800 text-white') : 'bg-gray-100 text-gray-800') + ' px-3 py-1.5 rounded-md text-sm'}>
                {k === 'A' ? 'A（売上）' : k === 'B' ? 'B（原価）' : k}
              </button>
            ))}
          </div>

          <button
            onClick={() => addRow(`${activeTop}.1`)}
            className="ml-3 inline-flex items-center px-3 py-1.5 rounded-md text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700"
          >行を追加</button>

          <div className="ml-4 flex items-center gap-1">
            <label className="text-sm text-gray-700" htmlFor="toggle-hide-empty">空行を非表示</label>
            <input id="toggle-hide-empty" type="checkbox" className="accent-indigo-600"
              checked={hideEmptyRows} onChange={e => setHideEmptyRows(e.target.checked)} />
          </div>
        </div>
      </div>

      {/* Totals for active section */}
      <div className="grid grid-cols-1 gap-4 mb-4">
        {activeTop === 'A' && (
          <div className="p-3 rounded bg-amber-50 border border-amber-200">
            <div className="text-xs text-amber-700">売上合計 (A.*)</div>
            <div className="text-sm text-gray-800">予算: ¥{formatJPY(totals.A.budget)} / 実施・予定: ¥{formatJPY(totals.A.actual)} / 確定: ¥{formatJPY(totals.A.confirmed)}</div>
          </div>
        )}
        {activeTop === 'B' && (
          <div className="p-3 rounded bg-cyan-50 border border-cyan-200">
            <div className="text-xs text-cyan-700">原価合計 (B.*)</div>
            <div className="text-sm text-gray-800">予算: ¥{formatJPY(totals.B.budget)} / 実施・予定: ¥{formatJPY(totals.B.actual)} / 確定: ¥{formatJPY(totals.B.confirmed)}</div>
          </div>
        )}
      </div>

      {/* Filters & rules */}
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <div className="flex items-center gap-1">
          <label className="text-sm text-gray-700">未払いのみ</label>
          <input type="checkbox" className="accent-indigo-600" checked={showUnpaidOnly} onChange={e => setShowUnpaidOnly(e.target.checked)} />
        </div>
        <div className="flex items-center gap-1">
          <label className="text-sm text-gray-700">要対応のみ</label>
          <input type="checkbox" className="accent-indigo-600" checked={showIssuesOnly} onChange={e => setShowIssuesOnly(e.target.checked)} />
        </div>
        <div className="flex items-center gap-1">
          <label className="text-sm text-gray-700">検索</label>
          <input className="border rounded px-2 py-1 text-sm w-56" placeholder="コード/名称/業者で検索" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
        </div>
        <div className="ml-auto flex items-center gap-1">
          <label className="text-sm text-gray-700" title="確定金額は契約金額として固定（編集不可）">確定金額ロック</label>
          <input type="checkbox" className="accent-indigo-600" checked={lockConfirmed} onChange={e => setLockConfirmed(e.target.checked)} />
        </div>
      </div>

      <div className="border rounded overflow-y-auto overflow-x-hidden">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-gray-50 border-b text-gray-700 text-xs">
            <tr>
              <th className="px-2 py-2 text-left sticky left-0 bg-gray-50 z-10 w-24">項目CD</th>
              <th className="px-2 py-2 text-left">内容</th>
              <th className="px-2 py-2 text-left">協力会社</th>
              <th className="px-2 py-2 text-right">事業開始時予算 金額</th>
              <th className="px-2 py-2 text-right">kW単価</th>
              <th className="px-2 py-2 text-right">現時点の実施済み及び予定 金額</th>
              <th className="px-2 py-2 text-left">日付（実施/予定）</th>
              <th className="px-2 py-2 text-right">確定金額</th>
              <th className="px-2 py-2 text-left">日付（確定）</th>
              <th className="px-2 py-2 text-left">支払日</th>
              <th className="px-2 py-2 text-left">備考</th>
              <th className="px-2 py-2 text-left">納品日</th>
              <th className="px-2 py-2 text-left">発注書番号</th>
              <th className="px-2 py-2 text-left">操作</th>
            </tr>
          </thead>
          <tbody>
            {viewItems.map(row => {
              const isEditing = editingId === row.id;
              const indent = levelFromCode(row.code) * 12;
              // Determine true aggregates: only if there are immediate non-'u*' children
              const isImmediateChildOf = (parent: string, child: string) => {
                return child.startsWith(parent + '.') && child.split('.').length === parent.split('.').length + 1;
              };
              const isUSegment = (seg: string) => /^u\d*$/i.test(seg);
              const hasNonUImmediateChildren = items.some(o => {
                if (o.code === row.code) return false;
                if (!isImmediateChildOf(row.code, o.code)) return false;
                const last = o.code.split('.').pop()!;
                return !isUSegment(last);
              });
              const isAggregate = row.is_aggregate_row || hasNonUImmediateChildren;
              const isAggSumRow = isAggregate;
              const isCostSummary = isCostSummaryRow(row);
              // Sum descendants for display on real aggregate rows (deepest-populated values only)
              const sumDescendants = (code: string, key: keyof Item) => {
                const desc = items.filter(it => it.code.startsWith(code + '.'));
                const hasDeeperWithValue = (base: string) =>
                  desc.some(d => d.code.startsWith(base + '.') && (d[key] as number | null) != null);
                return desc
                  .filter(it => !isCostSummaryRow(it))
                  .filter(it => (it[key] as number | null) != null)
                  .filter(it => !hasDeeperWithValue(it.code))
                  .map(it => (it[key] as number | null) || 0)
                  .reduce((a, b) => a + (b || 0), 0);
              };
              const isPaid = !!row.is_paid;
              const disabled = isAggSumRow || isCostSummary || isPaid;
              const displayBudget = isAggSumRow ? sumDescendants(row.code, 'budget_amount') : row.budget_amount;
              const displayActual = isAggSumRow ? sumDescendants(row.code, 'actual_planned_amount') : row.actual_planned_amount;
              const displayConfirmed = isAggSumRow ? sumDescendants(row.code, 'confirmed_amount') : row.confirmed_amount;
              const top = row.code.split('.')[0];
              const paidBg = isPaid ? 'bg-blue-50 hover:bg-blue-100' : '';
              const aggBg = isCostSummary ? 'bg-cyan-50 hover:bg-cyan-100' : (top === 'A' ? 'bg-amber-50 hover:bg-amber-100' : top === 'B' ? 'bg-cyan-50 hover:bg-cyan-100' : 'bg-slate-50 hover:bg-slate-100');
              const rowClass = `border-b ${isAggSumRow || isCostSummary ? `${aggBg} font-semibold` : isPaid ? `${paidBg}` : 'hover:bg-indigo-50/40'}`;
              return (
                <tr key={row.id} id={"row-" + encodeURIComponent(row.code)} className={rowClass}>
          <td className={"px-2 py-2 text-gray-800 align-top sticky left-0 bg-white w-24 " + ((isAggSumRow || isCostSummary) ? (isCostSummary ? 'border-l-4 border-cyan-500' : (top === 'A' ? 'border-l-4 border-amber-500' : top === 'B' ? 'border-l-4 border-cyan-500' : 'border-l-4 border-slate-400')) : isPaid ? 'border-l-4 border-blue-500' : '')}>
                    <span className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded border">{row.display_code || row.code}</span>
                    {isPaid && !isAggSumRow && !isCostSummary && (
                      <span className="ml-1 text-blue-600" title="支払い済み（編集不可）">🔒</span>
                    )}
                    {!isPaid && !isAggSumRow && !isCostSummary && row.confirmed_amount != null && (
                      <span className="ml-1 text-xs text-gray-700 bg-gray-100 border rounded px-1" title="契約済（確定金額あり）">契約済</span>
                    )}
                  </td>
                  <td className="px-2 py-2 align-top">
                    {isEditing ? (
            <input className="border rounded px-2 py-1 w-full" disabled={disabled}
                        value={row.title}
                        onChange={e => onChangeCell(row.id, 'title', e.target.value)}
                        style={{ paddingLeft: indent }} />
                    ) : (
            <div className={"text-gray-900 truncate max-w-[28ch] " + ((isAggSumRow || isCostSummary) ? (isCostSummary ? 'text-cyan-900' : (top === 'A' ? 'text-amber-900' : top === 'B' ? 'text-cyan-900' : 'text-slate-900')) : '')} style={{ paddingLeft: indent }} title={row.title}>{row.title || <span className="text-gray-400">（未入力）</span>}</div>
                    )}
                  </td>
          <td className="px-2 py-2 align-top">
                    {isEditing ? (
            <input className="border rounded px-2 py-1 w-full" disabled={disabled}
                        value={row.vendor || ''}
                        onChange={e => onChangeCell(row.id, 'vendor', e.target.value)} />
                    ) : (
            <div className="truncate max-w-[20ch]" title={row.vendor}>{row.vendor}</div>
                    )}
                  </td>
                  <td className="px-2 py-2 text-right align-top">
                    {isEditing ? (
                      <input className="border rounded px-2 py-1 w-full text-right" disabled={disabled}
                        value={row.budget_amount != null ? formatJPY(row.budget_amount) : ''}
                        onChange={e => onChangeCell(row.id, 'budget_amount', parseNumber(e.target.value))} />
                    ) : (
                      <div>¥{formatJPY(displayBudget as number | null)}</div>
                    )}
                  </td>
                  <td className="px-2 py-2 text-right align-top">
          {isAggSumRow ? (
                      <div className="text-gray-700 text-xs leading-5">
                        <div>予: ¥{kwUnitPrice(displayBudget as number | null)}</div>
                        <div>実: ¥{kwUnitPrice(displayActual as number | null)}</div>
                        <div>確: ¥{kwUnitPrice(displayConfirmed as number | null)}</div>
                      </div>
                    ) : isCostSummary ? (
                      <div className="text-gray-700 text-xs leading-5">
            <div>{costSummaryLabel(row)}kW単価: ¥{kwUnitPrice(row.actual_planned_amount as number | null)}</div>
                      </div>
                    ) : (
                      <div className="text-gray-700"></div>
                    )}
                  </td>
                  <td className="px-2 py-2 text-right align-top">
                    {isEditing ? (
                      <input className="border rounded px-2 py-1 w-full text-right" disabled={disabled}
                        value={row.actual_planned_amount != null ? formatJPY(row.actual_planned_amount) : ''}
                        onChange={e => onChangeCell(row.id, 'actual_planned_amount', parseNumber(e.target.value))} />
                    ) : (
                      <div>¥{formatJPY(displayActual as number | null)}</div>
                    )}
                  </td>
                  <td className="px-2 py-2 align-top">
                    {isEditing ? (
                      <input type="date" className="border rounded px-2 py-1 w-full" disabled={disabled}
                        value={row.actual_planned_date || ''}
                        onChange={e => onChangeCell(row.id, 'actual_planned_date', e.target.value)} />
                    ) : (
                      <div>{row.actual_planned_date}</div>
                    )}
                  </td>
                  <td className="px-2 py-2 text-right align-top">
                    {isEditing ? (
                      <input className="border rounded px-2 py-1 w-full text-right" disabled={disabled || lockConfirmed}
                        value={row.confirmed_amount != null ? formatJPY(row.confirmed_amount) : ''}
                        onChange={e => onChangeCell(row.id, 'confirmed_amount', parseNumber(e.target.value))} />
                    ) : (
                      <div>¥{formatJPY(displayConfirmed as number | null)}</div>
                    )}
                  </td>
                  <td className="px-2 py-2 align-top">
                    {isEditing ? (
                      <input type="date" className="border rounded px-2 py-1 w-full" disabled={disabled}
                        value={row.confirmed_date || ''}
                        onChange={e => onChangeCell(row.id, 'confirmed_date', e.target.value)} />
                    ) : (
                      <div>{row.confirmed_date}</div>
                    )}
                  </td>
                  <td className="px-2 py-2 align-top">
                    {isEditing ? (
                      <input type="date" className="border rounded px-2 py-1 w-full" disabled={disabled}
                        value={row.payment_date || ''}
                        onChange={e => onChangeCell(row.id, 'payment_date', e.target.value)} />
                    ) : (
                      <div>{row.payment_date}</div>
                    )}
                  </td>
                  
          <td className="px-2 py-2 align-top">
                    {isEditing ? (
            <input className="border rounded px-2 py-1 w-full" disabled={disabled}
                        value={row.note || ''}
                        onChange={e => onChangeCell(row.id, 'note', e.target.value)} />
                    ) : (
            <div className="text-gray-700 truncate max-w-[24ch]" title={row.note}>{row.note}</div>
                    )}
                  </td>
                  <td className="px-2 py-2 align-top">
                    {isEditing ? (
                      <input type="date" className="border rounded px-2 py-1 w-full" disabled={disabled}
                        value={row.delivery_date || ''}
                        onChange={e => onChangeCell(row.id, 'delivery_date', e.target.value)} />
                    ) : (
                      <div>{row.delivery_date}</div>
                    )}
                  </td>
                  <td className="px-2 py-2 align-top">
                    {isEditing ? (
            <input className="border rounded px-2 py-1 w-full" disabled={disabled}
                        value={row.po_number || ''}
                        onChange={e => onChangeCell(row.id, 'po_number', e.target.value)} />
                    ) : (
            <div className="truncate max-w-[18ch]" title={row.po_number}>{row.po_number}</div>
                    )}
                  </td>
                  <td className="px-2 py-2 align-top">
                    <div className="flex items-center gap-2">
                      {isEditing ? (
                        <>
                          <button onClick={() => setEditingId(null)} className="px-2 py-1 rounded bg-green-600 text-white text-xs">保存</button>
                          <button onClick={() => setEditingId(null)} className="px-2 py-1 rounded bg-gray-200 text-gray-800 text-xs">キャンセル</button>
                        </>
                      ) : (
                        <>
                          <button onClick={() => setEditingId(row.id)} className="px-2 py-1 rounded bg-indigo-600 text-white text-xs">編集</button>
                          <button onClick={() => duplicateRow(row.id)} className="px-2 py-1 rounded bg-slate-200 text-slate-800 text-xs">複製</button>
                          <button onClick={() => removeRow(row.id)} className="px-2 py-1 rounded bg-red-100 text-red-700 text-xs">削除</button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="text-xs text-gray-500 mt-3">
        注意：このグリッドはモックデータで動作しています。DB設計/API接続後に保存連携と再計算を有効化します。
      </div>
    </div>
  );
};
