import React from 'react';
import { Item, UnitBasis } from '../types';

const formatJPY = (v?: number | null) => {
  if (v === undefined || v === null || isNaN(v)) return '¥0';
  return `¥${v.toLocaleString('ja-JP')}`;
};

type Props = {
  items: Item[];
};

export const CostOverview: React.FC<Props> = ({ items }) => {
  const isCostSummaryRow = React.useCallback((row: Item) => {
    const hay = `${row.title || ''} ${row.vendor || ''} ${row.note || ''}`;
    // Treat both 「仕入合計」-type rows and 「収支」 rows as special summaries
    return (hay.includes('仕入') && hay.includes('合計')) || hay.includes('収支');
  }, []);
  // Hierarchy helpers
  const { sumForPrefix } = React.useMemo(() => {
    const codes = items.map(i => i.code);
    const hasChildren = new Map<string, boolean>();
    for (const c of codes) {
      hasChildren.set(c, codes.some(o => o !== c && o.startsWith(c + '.')));
    }
    const sumForPrefix = (prefix: string, key: keyof Item) => {
      const pool = items.filter(it => it.code === prefix || it.code.startsWith(prefix + '.'));
      const hasDeeperWithValue = (base: string) =>
        pool.some(d => d.code.startsWith(base + '.') && (d[key] as number | null) != null);
      return pool
        .filter(it => !isCostSummaryRow(it))
        .filter(it => (it[key] as number | null) != null)
        .filter(it => !hasDeeperWithValue(it.code))
        .map(it => (it[key] as number | null) || 0)
        .reduce((a, b) => a + (b || 0), 0);
    };
  return { sumForPrefix };
  }, [items, isCostSummaryRow]);

  // kW basis (for unit price display)
  const [unitBasis, setUnitBasis] = React.useState<UnitBasis>('dc');
  const [dcKw, setDcKw] = React.useState<number>(1458.24);
  const [acKw, setAcKw] = React.useState<number>(1250.0);
  const [customKw, setCustomKw] = React.useState<number>(1458.24);
  const denomKw = unitBasis === 'dc' ? dcKw : unitBasis === 'ac' ? acKw : customKw;

  const kwUnit = (amount: number) => {
    if (!amount || !denomKw) return '—';
    return formatJPY(Math.round(amount / denomKw));
  };

  // Top-level groups: A, B, ... (by first token)
  const topGroups = React.useMemo(() => {
    const groups = new Map<string, { budget: number; actual: number; confirmed: number }>();
    for (const it of items) {
      const top = it.code.split('.')[0];
      if (!top) continue;
      if (!groups.has(top)) groups.set(top, { budget: 0, actual: 0, confirmed: 0 });
    }
    for (const [g, v] of groups) {
      v.budget = sumForPrefix(g, 'budget_amount');
      v.actual = sumForPrefix(g, 'actual_planned_amount');
      v.confirmed = sumForPrefix(g, 'confirmed_amount');
    }
    return Array.from(groups.entries()).map(([key, val]) => ({ key, ...val }));
  }, [items, sumForPrefix]);

  // Map for quick top-level denominators (budget) e.g. A -> total A budget
  const topBudgetMap = React.useMemo(() => {
    const m = new Map<string, number>();
    for (const g of topGroups) m.set(g.key, g.budget || 0);
    return m;
  }, [topGroups]);

  // Sorting state
  const [sortKey, setSortKey] = React.useState<'ratio' | 'budget' | 'actual' | 'confirmed' | 'code' | 'title'>('ratio');
  const [sortDir, setSortDir] = React.useState<'asc' | 'desc'>('desc');

  // Active top-level tab (A=売上, B=原価)
  const [activeTop, setActiveTop] = React.useState<string>('A');
  const topKeys = React.useMemo(() => topGroups.map(g => g.key), [topGroups]);
  React.useEffect(() => {
    if (!topKeys.length) return;
    if (!topKeys.includes(activeTop)) {
      setActiveTop(topKeys.includes('A') ? 'A' : (topKeys.includes('B') ? 'B' : topKeys[0]));
    }
  }, [topKeys, activeTop]);

  // Second-level groups: like A.1, B.2
  const secondLevelGroups = React.useMemo(() => {
    const set = new Set<string>();
    for (const it of items) {
      const parts = it.code.split('.');
      if (parts.length >= 2) set.add(parts.slice(0, 2).join('.'));
    }
    const arr = Array.from(set);
    const enriched = arr.map(code => {
      const budget = sumForPrefix(code, 'budget_amount');
      const actual = sumForPrefix(code, 'actual_planned_amount');
      const confirmed = sumForPrefix(code, 'confirmed_amount');
      const title = items.find(it => it.code === code)?.title || '';
      const top = code.split('.')[0];
      const denom = topBudgetMap.get(top) || 0;
      const ratio = denom > 0 ? Math.min(100, Math.round((budget / denom) * 100)) : 0;
  return { code, title, budget, actual, confirmed, ratio, top, denom };
    });
    const cmpNum = (a: number, b: number) => a - b;
    const cmpStr = (a: string, b: string) => a.localeCompare(b, 'ja');
    enriched.sort((a, b) => {
      let res = 0;
      switch (sortKey) {
        case 'ratio': res = cmpNum(a.ratio, b.ratio); break;
        case 'budget': res = cmpNum(a.budget || 0, b.budget || 0); break;
        case 'actual': res = cmpNum(a.actual || 0, b.actual || 0); break;
        case 'confirmed': res = cmpNum(a.confirmed || 0, b.confirmed || 0); break;
        case 'code': res = cmpStr(a.code, b.code); break;
        case 'title': res = cmpStr(a.title || '', b.title || ''); break;
      }
      return sortDir === 'asc' ? res : -res;
    });
    return enriched;
  }, [items, sumForPrefix, topBudgetMap, sortKey, sortDir]);

  const filteredGroups = React.useMemo(() => secondLevelGroups.filter(g => g.top === activeTop), [secondLevelGroups, activeTop]);
  const grand = React.useMemo(() => ({
    budget: filteredGroups.reduce((a, b) => a + (b.budget || 0), 0),
    actual: filteredGroups.reduce((a, b) => a + (b.actual || 0), 0),
    confirmed: filteredGroups.reduce((a, b) => a + (b.confirmed || 0), 0),
  }), [filteredGroups]);

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">費用一覧（サマリー）</h3>
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-700">kW分母:</label>
          <select className="border rounded px-2 py-1 text-sm" value={unitBasis} onChange={e => setUnitBasis(e.target.value as UnitBasis)}>
            <option value="dc">DC</option>
            <option value="ac">AC</option>
            <option value="custom">カスタム</option>
          </select>
          {unitBasis === 'dc' && (
            <input className="border rounded px-2 py-1 w-28 text-sm" value={dcKw} onChange={e => setDcKw(Number(e.target.value))} />
          )}
          {unitBasis === 'ac' && (
            <input className="border rounded px-2 py-1 w-28 text-sm" value={acKw} onChange={e => setAcKw(Number(e.target.value))} />
          )}
          {unitBasis === 'custom' && (
            <input className="border rounded px-2 py-1 w-28 text-sm" value={customKw} onChange={e => setCustomKw(Number(e.target.value))} />
          )}

          <div className="ml-4 flex items-center gap-2">
            <label className="text-sm text-gray-700">並び替え:</label>
            <select className="border rounded px-2 py-1 text-sm" value={sortKey} onChange={e => setSortKey(e.target.value as any)}>
              <option value="ratio">割合（高い順）</option>
              <option value="budget">予算</option>
              <option value="actual">実施・予定</option>
              <option value="confirmed">確定</option>
              <option value="code">コード</option>
              <option value="title">名称</option>
            </select>
            <button className="px-2 py-1 text-sm border rounded" onClick={() => setSortDir(d => (d === 'desc' ? 'asc' : 'desc'))}>
              {sortDir === 'desc' ? '▼' : '▲'}
            </button>
          </div>
        </div>
      </div>

      {/* Top-level cards */}
      {/* Tabs for A/B */}
      <div className="flex items-center gap-2 mb-4">
        {topKeys.map(k => (
          <button key={k}
            onClick={() => setActiveTop(k)}
            className={(activeTop === k ? (k === 'A' ? 'bg-amber-600 text-white' : k === 'B' ? 'bg-cyan-600 text-white' : 'bg-gray-800 text-white') : 'bg-gray-100 text-gray-800') + ' px-3 py-1.5 rounded-md text-sm'}>
            {k === 'A' ? 'A（売上）' : k === 'B' ? 'B（原価）' : k}
          </button>
        ))}
      </div>

      {/* Selected section card */}
  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mb-6">
        {topGroups.filter(g => g.key === activeTop).map(g => (
          <div key={g.key} className={"p-4 rounded-lg border " + (g.key === 'A' ? 'bg-amber-50 border-amber-200' : g.key === 'B' ? 'bg-cyan-50 border-cyan-200' : 'bg-gray-50')}>
            <div className="text-xs text-gray-500">セクション</div>
            <div className="text-lg font-semibold text-gray-900 mb-2">{g.key}</div>
            <div className="text-sm text-gray-700">予算: {formatJPY(g.budget)}</div>
            <div className="text-sm text-gray-700">実施・予定: {formatJPY(g.actual)}</div>
            <div className="text-sm text-gray-700">確定: {formatJPY(g.confirmed)}</div>
            <div className="text-xs text-gray-600 mt-2 space-y-0.5">
              <div>kW単価（予算）: {kwUnit(g.budget)}</div>
              <div>kW単価（実施）: {kwUnit(g.actual)}</div>
              <div>kW単価（確定）: {kwUnit(g.confirmed)}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Second-level table */}
  <div className="border rounded overflow-y-auto overflow-x-hidden">
    <table className="w-full text-sm">
          <thead className="sticky top-0 bg-gray-50 border-b text-gray-700">
            <tr>
      <th className="px-3 py-2 text-left">グループ</th>
      <th className="px-3 py-2 text-left">名称</th>
      <th className="px-3 py-2 text-right">予算</th>
      <th className="px-3 py-2 text-right">実施・予定</th>
      <th className="px-3 py-2 text-right">確定</th>
      <th className="px-3 py-2 text-right">kW単価（予算/実施/確定）</th>
      <th className="px-3 py-2">構成比（予算／Aは売上・Bは原価）</th>
            </tr>
          </thead>
          <tbody>
            {filteredGroups.map(g => {
              const ratio = g.ratio;
              return (
                <tr key={g.code} className={"border-b hover:bg-indigo-50/40 " + (g.top === 'A' ? 'bg-amber-50/40' : g.top === 'B' ? 'bg-cyan-50/40' : '')}>
      <td className="px-3 py-2 font-mono text-xs w-24"><span className="bg-gray-100 px-1.5 py-0.5 rounded border">{items.find(it => it.code === g.code)?.display_code || g.code}</span></td>
      <td className="px-3 py-2 truncate max-w-[40ch]" title={g.title}>{g.title || <span className="text-gray-400">（未入力）</span>}</td>
                  <td className="px-3 py-2 text-right">{formatJPY(g.budget)}</td>
                  <td className="px-3 py-2 text-right">{formatJPY(g.actual)}</td>
                  <td className="px-3 py-2 text-right">{formatJPY(g.confirmed)}</td>
                  <td className="px-3 py-2 text-right text-xs">
                    <div className="leading-5">
                      <div>予: {kwUnit(g.budget)}</div>
                      <div>実: {kwUnit(g.actual)}</div>
                      <div>確: {kwUnit(g.confirmed)}</div>
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <div className="w-full bg-gray-100 h-3 rounded">
                      <div className="h-3 rounded bg-indigo-500" style={{ width: `${ratio}%` }} />
                    </div>
                    <div className="text-xs text-gray-600 mt-1">{ratio}%</div>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="bg-slate-50 border-t">
              <td className="px-3 py-2 font-semibold" colSpan={2}>合計</td>
              <td className="px-3 py-2 text-right font-semibold">{formatJPY(grand.budget)}</td>
              <td className="px-3 py-2 text-right font-semibold">{formatJPY(grand.actual)}</td>
              <td className="px-3 py-2 text-right font-semibold">{formatJPY(grand.confirmed)}</td>
              <td className="px-3 py-2 text-right font-semibold">{kwUnit(grand.budget)}</td>
              <td className="px-3 py-2" />
            </tr>
          </tfoot>
        </table>
      </div>

  <div className="text-xs text-gray-500 mt-3">注: 集計は同じ指標でより深い子に値がある場合は親の値を除外する「最深値のみ」ルールで二重計上を防いでいます。</div>
    </div>
  );
};
